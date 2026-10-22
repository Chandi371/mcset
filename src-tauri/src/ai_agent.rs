use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::json;
use crate::mcp_tools::McpToolEngine;
use tauri::Emitter;
use crate::models::{AiChatEvent, AiChatMessage, AiProviderConfig, McpToolCall};

pub struct AiAgent {
    mcp_engine: Arc<McpToolEngine>,
    cancel_flag: Arc<AtomicBool>,
}

impl AiAgent {
    pub fn new(mcp_engine: Arc<McpToolEngine>) -> Self {
        AiAgent {
            mcp_engine,
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Helper to produce a human-friendly description of what tool the AI is executing
    fn format_step_description(tool_name: &str, args: &serde_json::Value) -> String {
        match tool_name {
            "search_modpacks" => {
                let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("modpacks");
                let p = args.get("provider").and_then(|v| v.as_str()).unwrap_or("modrinth");
                format!("Searching {} for '{}'", p, q)
            }
            "get_modpack_versions" => {
                let p = args.get("project_id").and_then(|v| v.as_str()).unwrap_or("");
                format!("Fetching versions for modpack '{}'", p)
            }
            "install_modpack_server" => {
                let n = args.get("name").and_then(|v| v.as_str()).unwrap_or("Modpack Server");
                format!("Installing & deploying modpack server '{}'", n)
            }
            "create_server" => {
                let n = args.get("name").and_then(|v| v.as_str()).unwrap_or("Server");
                let t = args.get("server_type").and_then(|v| v.as_str()).unwrap_or("vanilla");
                format!("Creating {} server '{}'", t, n)
            }
            "download_java_runtime" => {
                let m = args.get("major_version").and_then(|v| v.as_u64()).unwrap_or(21);
                format!("Downloading portable OpenJDK Java {}", m)
            }
            "auto_fix_server_java" => {
                "Auto-fixing Java version incompatibility".to_string()
            }
            "start_server" => "Starting server process".to_string(),
            "stop_server" => "Stopping server process".to_string(),
            "restart_server" => "Restarting server".to_string(),
            "read_server_logs" => "Reading server console logs".to_string(),
            "inspect_crash_report" => "Inspecting crash report and stack trace".to_string(),
            "read_config" => {
                let path = args.get("relative_path").and_then(|v| v.as_str()).unwrap_or("server.properties");
                format!("Reading config file '{}'", path)
            }
            "propose_config_change" | "apply_config_change" | "set_server_property" => {
                "Updating server configuration".to_string()
            }
            "send_console_command" => {
                let cmd = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
                format!("Executing console command '/{}'", cmd.trim_start_matches('/'))
            }
            "list_servers" => "Listing configured servers".to_string(),
            "get_server_status" => "Checking server status and resource usage".to_string(),
            "list_plugins" => "Listing installed plugins and mods".to_string(),
            "search_plugins" => {
                let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                format!("Searching plugins for '{}'", q)
            }
            "install_plugin" => "Installing plugin/mod".to_string(),
            "create_backup" => "Creating server world backup".to_string(),
            "enable_public_access" => "Opening public Portal TCP tunnel".to_string(),
            "disable_public_access" => "Closing public Portal tunnel".to_string(),
            _ => format!("Running {}", tool_name),
        }
    }

    fn format_tool_result_thought(tool_name: &str, desc: &str, success: bool) -> String {
        if success {
            match tool_name {
                "search_modpacks" => "Found matching modpacks. Inspecting versions and server pack downloads...".to_string(),
                "get_modpack_versions" => "Retrieved compatible versions. Checking server loader requirements...".to_string(),
                "install_modpack_server" => "Modpack server installed and configured successfully.".to_string(),
                "create_server" => "Server instance created and registered into MCSet.".to_string(),
                "list_servers" => "Loaded configured servers to verify port and directory isolation.".to_string(),
                "download_java_runtime" => "OpenJDK runtime downloaded and installed into managed runtimes.".to_string(),
                "auto_fix_server_java" => "Java version resolved and server restarted.".to_string(),
                "read_server_logs" => "Parsed recent server logs. Analyzing warnings and stack traces...".to_string(),
                "inspect_crash_report" => "Inspected crash report and identified error chain.".to_string(),
                "start_server" => "Server started successfully. Monitoring startup status...".to_string(),
                "stop_server" => "Server stopped safely.".to_string(),
                "restart_server" => "Server restart initiated.".to_string(),
                _ => format!("Completed: {}. Formulating next steps...", desc),
            }
        } else {
            format!("Notice: {} reported an issue. Evaluating alternatives...", desc)
        }
    }

    async fn stream_text_to_ui(
        app_handle: &tauri::AppHandle,
        text: &str,
        cancel_flag: &AtomicBool,
    ) {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }

        let mut tokens = Vec::new();
        let mut current_token = String::new();
        for ch in text.chars() {
            current_token.push(ch);
            if ch.is_whitespace() {
                tokens.push(current_token.clone());
                current_token.clear();
            }
        }
        if !current_token.is_empty() {
            tokens.push(current_token);
        }

        let total_tokens = tokens.len();
        let delay_ms = if total_tokens > 150 {
            10
        } else if total_tokens > 60 {
            16
        } else {
            22
        };

        let chunk_size = if total_tokens > 150 { 3 } else { 2 };
        let mut accumulated = String::with_capacity(text.len());

        for chunk in tokens.chunks(chunk_size) {
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }
            for token in chunk {
                accumulated.push_str(token);
            }
            let _ = app_handle.emit(
                "ai-chat-event",
                AiChatEvent {
                    event_type: "message".to_string(),
                    content: Some(accumulated.clone()),
                    tool_name: None,
                    tool_call_id: None,
                    step_description: None,
                    is_final: false,
                },
            );
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }
    }

    /// Stops any active running AI tool calling loop
    pub fn stop(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    /// Runs a conversational turn with tool execution support
    /// Runs a conversational turn with tool execution support, returning all new messages generated
    pub async fn chat(
        &self,
        config: &AiProviderConfig,
        messages: Vec<AiChatMessage>,
        active_server_id: Option<String>,
    ) -> Result<Vec<AiChatMessage>> {
        if config.api_key.trim().is_empty() && config.provider != "ollama" {
            return Err(anyhow!(
                "AI Provider API key is required. Please configure your API key in Settings -> AI Provider."
            ));
        }

        let tools = McpToolEngine::get_tool_definitions();
        let mut conversation = messages.clone();

        // System prompt
        let system_prompt = format!(
            "You are MCSet AI Technician, an expert Minecraft server administrator and technician assistant.\n\
             Your role is to assist the user in managing, configuring, diagnosing, and expanding their Minecraft servers in a safe, transparent, and friendly manner.\n\
             \n\
             COMMUNICATION & CONVERSATION STYLE:\n\
             1. Communicate naturally, concisely, and helpfully like a polished, friendly AI technician (e.g. Gemini / ChatGPT).\n\
             2. Explain technical issues in clear, beginner-friendly terms by default. Deeper technical diagnostics and stack-trace specifics are always available on request.\n\
             3. Format your answers using clean, structured Markdown (bold headers, bulleted lists, code blocks with language tags).\n\
             4. Never dump raw JSON payloads, unparsed API data, or internal debug logs directly into conversation text. Use human-readable summaries instead.\n\
             5. When performing actions, explain what you found, what you recommend, and what you changed.\n\
             6. Truthfulness: Never claim a server was created, a command executed, or a configuration modified unless the tool execution confirmed success.\n\
             7. If a tool fails or reports a conflict (e.g. port already in use), explain the cause clearly and offer actionable next steps.\n\
             \n\
             SAFETY & TOOLS:\n\
             1. You have access to powerful local MCP tools for server lifecycle, logs, configuration, crash reports, and plugin installation.\n\
             2. Live console commands: Informational commands ('list', 'tps', 'seed', 'help') execute immediately. Privilege, moderation, or destructive commands ('op', 'ban', 'kick', 'stop', 'fill') automatically generate an approval card in the UI so the user can review and approve them before running.\n\
             3. Configuration files: Prefer targeted reads ('read_config') and targeted patches ('patch_file', 'set_server_property', 'find_in_file') over rewriting entire files.\n\
             4. Crash diagnosis: Use 'inspect_crash_report' or 'read_server_logs' (with severity filtering) to inspect crash causes and root cause chains.\n\
             5. Server creation & startup: 'create_server' and 'start_server' automatically detect port conflicts and safely reassign or alert.\n\
             6. Performance & Lag Diagnosis: When the user asks about lag, low TPS, rubber-banding, or slow server performance, call 'diagnose_server_performance' to inspect real-time TPS, tick times, CPU/RAM utilization, overload warnings in server logs, view-distance settings, and missing optimization mods/plugins (e.g. Lithium, FerriteCore, spark). Explain the root causes clearly and offer concrete configuration tuning or mod recommendations.\n\
             7. Current active server: {}\n",
            active_server_id.as_deref().unwrap_or("None selected")
        );

        // Prepend system prompt if not present
        if !conversation.iter().any(|m| m.role == "system") {
            conversation.insert(
                0,
                AiChatMessage {
                    role: "system".to_string(),
                    content: system_prompt,
                    tool_calls: None,
                    tool_call_id: None,
                },
            );
        }

        let start_index = conversation.len();
        self.cancel_flag.store(false, Ordering::SeqCst);

        let _ = self.mcp_engine.app_handle.emit(
            "ai-chat-event",
            AiChatEvent {
                event_type: "thought".to_string(),
                content: Some(format!(
                    "Analyzing request for server '{}' and checking environment...",
                    active_server_id.as_deref().unwrap_or("none")
                )),
                tool_name: None,
                tool_call_id: None,
                step_description: Some("Analyzing request...".to_string()),
                is_final: false,
            },
        );

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()?;

        // Tool calling iteration loop (up to 25 steps for multi-step operations)
        let max_iterations = 25;
        for _ in 0..max_iterations {
            if self.cancel_flag.load(Ordering::SeqCst) {
                let mut out = conversation[start_index..].to_vec();
                out.push(AiChatMessage {
                    role: "assistant".to_string(),
                    content: "Action stopped by user.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                });
                return Ok(out);
            }

            let model_response = match config.provider.to_lowercase().as_str() {
                "anthropic" => self.call_anthropic(&client, config, &conversation, &tools).await?,
                "gemini" => self.call_gemini(&client, config, &conversation, &tools).await?,
                _ => self.call_openai_compatible(&client, config, &conversation, &tools).await?,
            };

            if self.cancel_flag.load(Ordering::SeqCst) {
                let mut out = conversation[start_index..].to_vec();
                out.push(AiChatMessage {
                    role: "assistant".to_string(),
                    content: "Action stopped by user.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                });
                return Ok(out);
            }

            // If the model called tools, execute them
            if let Some(ref tool_calls) = model_response.tool_calls {
                if !tool_calls.is_empty() {
                    if !model_response.content.trim().is_empty() {
                        let _ = self.mcp_engine.app_handle.emit(
                            "ai-chat-event",
                            AiChatEvent {
                                event_type: "thought".to_string(),
                                content: Some(model_response.content.clone()),
                                tool_name: None,
                                tool_call_id: None,
                                step_description: Some("Technician reasoning".to_string()),
                                is_final: false,
                            },
                        );
                    }

                    // Push the assistant response containing tool calls
                    conversation.push(model_response.clone());

                    for (idx, call) in tool_calls.iter().enumerate() {
                        if self.cancel_flag.load(Ordering::SeqCst) {
                            let mut out = conversation[start_index..].to_vec();
                            out.push(AiChatMessage {
                                role: "assistant".to_string(),
                                content: "Action stopped by user while executing tools.".to_string(),
                                tool_calls: None,
                                tool_call_id: None,
                            });
                            return Ok(out);
                        }

                        let desc = Self::format_step_description(&call.name, &call.arguments);
                        let _ = self.mcp_engine.app_handle.emit(
                            "ai-chat-event",
                            AiChatEvent {
                                event_type: "thought".to_string(),
                                content: Some(format!("Step {}/{}: Running {}", idx + 1, tool_calls.len(), desc)),
                                tool_name: Some(call.name.clone()),
                                tool_call_id: Some(call.id.clone()),
                                step_description: Some(desc.clone()),
                                is_final: false,
                            },
                        );

                        let _ = self.mcp_engine.app_handle.emit(
                            "ai-chat-event",
                            AiChatEvent {
                                event_type: "tool_call".to_string(),
                                content: Some(call.arguments.to_string()),
                                tool_name: Some(call.name.clone()),
                                tool_call_id: Some(call.id.clone()),
                                step_description: Some(desc.clone()),
                                is_final: false,
                            },
                        );

                        let result = self.mcp_engine.execute_tool(call).await;
                        let tool_content = if result.success {
                            result.output.to_string()
                        } else {
                            json!({ "error": result.error.unwrap_or_else(|| "Unknown error".to_string()) }).to_string()
                        };

                        let _ = self.mcp_engine.app_handle.emit(
                            "ai-chat-event",
                            AiChatEvent {
                                event_type: "tool_result".to_string(),
                                content: Some(tool_content.clone()),
                                tool_name: Some(call.name.clone()),
                                tool_call_id: Some(call.id.clone()),
                                step_description: Some(if result.success {
                                    format!("Completed: {}", desc)
                                } else {
                                    format!("Failed: {}", desc)
                                }),
                                is_final: false,
                            },
                        );

                        let summary_thought = Self::format_tool_result_thought(&call.name, &desc, result.success);
                        let _ = self.mcp_engine.app_handle.emit(
                            "ai-chat-event",
                            AiChatEvent {
                                event_type: "thought".to_string(),
                                content: Some(summary_thought),
                                tool_name: Some(call.name.clone()),
                                tool_call_id: Some(call.id.clone()),
                                step_description: Some(desc.clone()),
                                is_final: false,
                            },
                        );

                        conversation.push(AiChatMessage {
                            role: "tool".to_string(),
                            content: tool_content,
                            tool_calls: None,
                            tool_call_id: Some(call.id.clone()),
                        });
                    }

                    let _ = self.mcp_engine.app_handle.emit(
                        "ai-chat-event",
                        AiChatEvent {
                            event_type: "thought".to_string(),
                            content: Some("Operations finished. Synthesizing technical findings and generating response...".to_string()),
                            tool_name: None,
                            tool_call_id: None,
                            step_description: Some("Formulating response...".to_string()),
                            is_final: false,
                        },
                    );
                    continue; // Loop back so model can formulate natural language response
                }
            }

            let _ = self.mcp_engine.app_handle.emit(
                "ai-chat-event",
                AiChatEvent {
                    event_type: "thought".to_string(),
                    content: Some("Writing technician response...".to_string()),
                    tool_name: None,
                    tool_call_id: None,
                    step_description: None,
                    is_final: false,
                },
            );

            // Stream text smoothly word-by-word like writing
            Self::stream_text_to_ui(
                &self.mcp_engine.app_handle,
                &model_response.content,
                &self.cancel_flag,
            ).await;

            let _ = self.mcp_engine.app_handle.emit(
                "ai-chat-event",
                AiChatEvent {
                    event_type: "message".to_string(),
                    content: Some(model_response.content.clone()),
                    tool_name: None,
                    tool_call_id: None,
                    step_description: None,
                    is_final: true,
                },
            );
            let _ = self.mcp_engine.app_handle.emit(
                "ai-chat-event",
                AiChatEvent {
                    event_type: "done".to_string(),
                    content: None,
                    tool_name: None,
                    tool_call_id: None,
                    step_description: None,
                    is_final: true,
                },
            );

            conversation.push(model_response);
            return Ok(conversation[start_index..].to_vec());
        }

        // If iterations reached ceiling, request a final summary from the model without tools
        conversation.push(AiChatMessage {
            role: "user".to_string(),
            content: "You have executed multiple operations. Please provide a clear summary of what you have accomplished so far and what steps remain.".to_string(),
            tool_calls: None,
            tool_call_id: None,
        });

        let summary_response = match config.provider.to_lowercase().as_str() {
            "anthropic" => self.call_anthropic(&client, config, &conversation, &[]).await,
            "gemini" => self.call_gemini(&client, config, &conversation, &[]).await,
            _ => self.call_openai_compatible(&client, config, &conversation, &[]).await,
        };

        match summary_response {
            Ok(resp) => {
                conversation.push(resp);
            }
            Err(_) => {
                conversation.push(AiChatMessage {
                    role: "assistant".to_string(),
                    content: "I executed several steps for your request (server creation / configuration), but reached the step limit. Please check the Server List or Console to review current status, and message me if you'd like me to continue with remaining steps.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                });
            }
        }

        let final_content = conversation.last().map(|m| m.content.clone()).unwrap_or_default();
        Self::stream_text_to_ui(
            &self.mcp_engine.app_handle,
            &final_content,
            &self.cancel_flag,
        ).await;

        let _ = self.mcp_engine.app_handle.emit(
            "ai-chat-event",
            AiChatEvent {
                event_type: "message".to_string(),
                content: Some(final_content),
                tool_name: None,
                tool_call_id: None,
                step_description: None,
                is_final: true,
            },
        );
        let _ = self.mcp_engine.app_handle.emit(
            "ai-chat-event",
            AiChatEvent {
                event_type: "done".to_string(),
                content: None,
                tool_name: None,
                tool_call_id: None,
                step_description: None,
                is_final: true,
            },
        );

        Ok(conversation[start_index..].to_vec())
    }

    /// OpenAI-compatible provider (OpenAI, DeepSeek, OpenRouter, Groq, local Ollama)
    async fn call_openai_compatible(
        &self,
        client: &Client,
        config: &AiProviderConfig,
        messages: &[AiChatMessage],
        tools: &[serde_json::Value],
    ) -> Result<AiChatMessage> {
        let api_key = config.api_key.trim();
        let provider = config.provider.to_lowercase();
        let is_openrouter = provider == "openrouter" || api_key.starts_with("sk-or-v1");
        let is_ollama = provider == "ollama";

        let default_base_url = if is_openrouter {
            "https://openrouter.ai/api/v1"
        } else if is_ollama {
            "http://localhost:11434/v1"
        } else {
            "https://api.openai.com/v1"
        };

        let base_url = config
            .base_url
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or(default_base_url);

        let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));

        let mut formatted_msgs = Vec::new();
        let mut seen_first_user = false;

        for m in messages {
            // Skip client-side assistant greeting banners before the first user message
            if !seen_first_user && m.role == "assistant" && m.tool_calls.is_none() {
                continue;
            }
            if m.role == "user" {
                seen_first_user = true;
            }

            let mut obj = json!({
                "role": m.role,
            });

            if m.role == "tool" {
                obj["content"] = json!(m.content);
                if let Some(ref id) = m.tool_call_id {
                    obj["tool_call_id"] = json!(id);
                }
            } else if m.role == "assistant" {
                if let Some(ref tc) = m.tool_calls {
                    if !tc.is_empty() {
                        let tc_json: Vec<serde_json::Value> = tc
                            .iter()
                            .map(|t| {
                                json!({
                                    "id": t.id,
                                    "type": "function",
                                    "function": {
                                        "name": t.name,
                                        "arguments": t.arguments.to_string()
                                    }
                                })
                            })
                            .collect();
                        obj["tool_calls"] = json!(tc_json);
                        if m.content.is_empty() {
                            obj["content"] = serde_json::Value::Null;
                        } else {
                            obj["content"] = json!(m.content);
                        }
                    } else {
                        obj["content"] = json!(m.content);
                    }
                } else {
                    obj["content"] = json!(m.content);
                }
            } else {
                obj["content"] = json!(m.content);
            }

            formatted_msgs.push(obj);
        }

        let model_name = if config.model.trim().is_empty() {
            if is_openrouter {
                "anthropic/claude-3.5-sonnet"
            } else if is_ollama {
                "llama3.2"
            } else {
                "gpt-4o-mini"
            }
        } else {
            config.model.trim()
        };

        let mut body = json!({
            "model": model_name,
            "messages": formatted_msgs,
            "temperature": 0.3,
        });

        if !tools.is_empty() {
            body["tools"] = json!(tools);
        }

        let mut req = client.post(&endpoint).json(&body);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        if is_openrouter {
            req = req
                .header("HTTP-Referer", "https://mcset.app")
                .header("X-Title", "MCSet Minecraft Manager");
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                return Err(anyhow!(
                    "Failed to connect to AI Provider ({}). Details: {}. Check your network connection or API URL.",
                    endpoint, e
                ));
            }
        };

        let status = resp.status();
        let raw_text = match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                return Err(anyhow!(
                    "Connection was closed or timed out while receiving AI response (HTTP {}): {}. \
                     Note: Free tier models on OpenRouter can be very slow or queued. Consider choosing a fast free model like 'google/gemini-2.0-flash-exp:free' or 'meta-llama/llama-3.3-70b-instruct:free'.",
                    status, e
                ));
            }
        };

        if !status.is_success() {
            return Err(anyhow!("AI Provider error (HTTP {}): {}", status, raw_text));
        }

        let res_json: serde_json::Value = match serde_json::from_str(&raw_text) {
            Ok(j) => j,
            Err(e) => {
                let preview = if raw_text.len() > 300 { &raw_text[..300] } else { &raw_text };
                return Err(anyhow!(
                    "AI Provider response was not valid JSON: {}. Response preview: {}",
                    e, preview
                ));
            }
        };

        // Check if provider returned an API error in 200 payload
        if let Some(err_obj) = res_json.get("error") {
            let msg = err_obj["message"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| err_obj.to_string());
            return Err(anyhow!("AI Provider returned error: {}", msg));
        }

        let choice = match res_json["choices"].as_array().and_then(|c| c.first()) {
            Some(c) => &c["message"],
            None => {
                let preview = if raw_text.len() > 300 { &raw_text[..300] } else { &raw_text };
                return Err(anyhow!("AI Provider returned empty choices array. Body: {}", preview));
            }
        };

        let mut content = choice["content"].as_str().unwrap_or("").to_string();
        if content.trim().is_empty() {
            // Check reasoning tokens for models like DeepSeek R1 or reasoning models
            if let Some(r) = choice["reasoning"].as_str() {
                content = r.to_string();
            } else if let Some(r) = choice["reasoning_content"].as_str() {
                content = r.to_string();
            }
        }

        let tool_calls = if let Some(tc_array) = choice["tool_calls"].as_array() {
            let calls: Vec<McpToolCall> = tc_array
                .iter()
                .filter_map(|t| {
                    let id = t["id"].as_str()?.to_string();
                    let name = t["function"]["name"].as_str()?.to_string();
                    let arg_str = t["function"]["arguments"].as_str()?;
                    let args = serde_json::from_str(arg_str).unwrap_or(json!({}));
                    Some(McpToolCall {
                        id,
                        name,
                        arguments: args,
                    })
                })
                .collect();
            if calls.is_empty() {
                None
            } else {
                Some(calls)
            }
        } else {
            None
        };

        Ok(AiChatMessage {
            role: "assistant".to_string(),
            content,
            tool_calls,
            tool_call_id: None,
        })
    }

    /// Anthropic Claude implementation
    async fn call_anthropic(
        &self,
        client: &Client,
        config: &AiProviderConfig,
        messages: &[AiChatMessage],
        _tools: &[serde_json::Value],
    ) -> Result<AiChatMessage> {
        let endpoint = "https://api.anthropic.com/v1/messages";
        let model_name = if config.model.trim().is_empty() {
            "claude-3-5-sonnet-20241022"
        } else {
            &config.model
        };

        let system_msg = messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        let anthropic_msgs: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                json!({
                    "role": if m.role == "assistant" { "assistant" } else { "user" },
                    "content": m.content
                })
            })
            .collect();

        let body = json!({
            "model": model_name,
            "max_tokens": 4096,
            "system": system_msg,
            "messages": anthropic_msgs,
        });

        let resp = client
            .post(endpoint)
            .header("x-api-key", config.api_key.trim())
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let raw_text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("Anthropic API error (HTTP {}): {}", status, raw_text));
        }

        let res_json: serde_json::Value = serde_json::from_str(&raw_text)
            .map_err(|e| anyhow!("Failed to parse Anthropic JSON: {}. Body: {}", e, raw_text))?;
        let content = res_json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|item| item["text"].as_str())
            .unwrap_or("")
            .to_string();

        Ok(AiChatMessage {
            role: "assistant".to_string(),
            content,
            tool_calls: None,
            tool_call_id: None,
        })
    }

    /// Google Gemini implementation
    async fn call_gemini(
        &self,
        client: &Client,
        config: &AiProviderConfig,
        messages: &[AiChatMessage],
        tools: &[serde_json::Value],
    ) -> Result<AiChatMessage> {
        let model_name = if config.model.trim().is_empty() {
            "gemini-1.5-flash"
        } else {
            &config.model
        };
        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model_name,
            config.api_key.trim()
        );

        let system_text = messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        let mut contents: Vec<serde_json::Value> = Vec::new();
        for m in messages.iter().filter(|m| m.role != "system") {
            let role = if m.role == "assistant" { "model" } else { "user" };
            contents.push(json!({
                "role": role,
                "parts": [{ "text": m.content }]
            }));
        }

        let mut body = json!({
            "contents": contents
        });

        if !system_text.is_empty() {
            body["system_instruction"] = json!({
                "parts": [{ "text": system_text }]
            });
        }

        if !tools.is_empty() {
            let mut function_declarations: Vec<serde_json::Value> = tools
                .iter()
                .filter_map(|t| t.get("function").cloned())
                .collect();

            for func in &mut function_declarations {
                if let Some(params) = func.get_mut("parameters") {
                    Self::standardize_schema_types(params);
                }
            }

            if !function_declarations.is_empty() {
                body["tools"] = json!([{
                    "function_declarations": function_declarations
                }]);
            }
        }

        let resp = client.post(&endpoint).json(&body).send().await?;
        let status = resp.status();
        let raw_text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("Gemini API error (HTTP {}): {}", status, raw_text));
        }

        let res_json: serde_json::Value = serde_json::from_str(&raw_text)
            .map_err(|e| anyhow!("Failed to parse Gemini JSON: {}. Body: {}", e, raw_text))?;

        let candidate = res_json["candidates"]
            .as_array()
            .and_then(|arr| arr.first())
            .ok_or_else(|| anyhow!("Gemini returned no candidates"))?;

        let parts = candidate["content"]["parts"].as_array();
        let mut text_parts = Vec::new();
        let mut tool_calls = Vec::new();

        if let Some(parts_arr) = parts {
            for part in parts_arr {
                if let Some(txt) = part["text"].as_str() {
                    text_parts.push(txt);
                } else if let Some(func_call) = part.get("functionCall") {
                    if let Some(fn_name) = func_call["name"].as_str() {
                        let args = func_call.get("args").cloned().unwrap_or(json!({}));
                        tool_calls.push(McpToolCall {
                            id: format!("call_{}", &uuid::Uuid::new_v4().to_string()[..8]),
                            name: fn_name.to_string(),
                            arguments: args,
                        });
                    }
                }
            }
        }

        let final_text = text_parts.join("\n");
        let calls_opt = if tool_calls.is_empty() { None } else { Some(tool_calls) };

        Ok(AiChatMessage {
            role: "assistant".to_string(),
            content: final_text,
            tool_calls: calls_opt,
            tool_call_id: None,
        })
    }
    /// Recursively standardizes JSON schema types to lowercase ("string", "object", "integer", "number", "boolean", "array")
    /// ensuring 100% specification compliance across Gemini, OpenAI, Claude, and local Ollama models.
    pub fn standardize_schema_types(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(type_val) = map.get_mut("type") {
                    if let Some(s) = type_val.as_str() {
                        let lower = s.to_ascii_lowercase();
                        *type_val = serde_json::Value::String(lower);
                    }
                }
                for (_, v) in map.iter_mut() {
                    Self::standardize_schema_types(v);
                }
            }
            serde_json::Value::Array(arr) => {
                for item in arr.iter_mut() {
                    Self::standardize_schema_types(item);
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_standardize_schema_types_uppercase_to_lowercase() {
        let mut schema = json!({
            "type": "OBJECT",
            "properties": {
                "server_id": { "type": "STRING", "description": "Server ID" },
                "port": { "type": "INTEGER", "description": "Port" },
                "enabled": { "type": "BOOLEAN" },
                "tags": {
                    "type": "ARRAY",
                    "items": { "type": "STRING" }
                }
            },
            "required": ["server_id"]
        });

        AiAgent::standardize_schema_types(&mut schema);

        assert_eq!(schema["type"], "object");
        assert_eq!(schema["properties"]["server_id"]["type"], "string");
        assert_eq!(schema["properties"]["port"]["type"], "integer");
        assert_eq!(schema["properties"]["enabled"]["type"], "boolean");
        assert_eq!(schema["properties"]["tags"]["type"], "array");
        assert_eq!(schema["properties"]["tags"]["items"]["type"], "string");
    }
}
