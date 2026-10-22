import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateServerModal } from "../components/CreateServerModal";
import { ConfigEditor } from "../components/ConfigEditor";
import { ShareServerModal } from "../components/ShareServerModal";
import { ServerProfile } from "../types";

const mockServer: ServerProfile = {
  id: "test-server-1",
  name: "Survival Test Server",
  server_type: "paper",
  minecraft_version: "1.21.4",
  java_path: "C:\\Program Files\\Java\\jdk-21.0.12\\bin\\java.exe",
  min_ram_mb: 2048,
  max_ram_mb: 4096,
  jvm_flags: "-XX:+UseG1GC",
  server_dir: "C:\\mcset\\servers\\survival_test",
  jar_file: "paper.jar",
  port: 25565,
  eula_accepted: true,
  autostart: false,
  created_at: 1700000000,
  updated_at: 1700000000,
};

describe("MCSet Platform Components", () => {
  it("renders CreateServerModal with software modes and memory sliders", () => {
    const handleClose = vi.fn();
    const handleCreated = vi.fn();

    render(
      <CreateServerModal
        isOpen={true}
        onClose={handleClose}
        onServerCreated={handleCreated}
      />
    );

    expect(screen.getByText("Create New Server")).toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("Fabric")).toBeInTheDocument();
    expect(screen.getByText("NeoForge")).toBeInTheDocument();
    expect(screen.getByText("Forge")).toBeInTheDocument();
    expect(screen.getByText("Quilt")).toBeInTheDocument();
    expect(screen.getByText("Vanilla")).toBeInTheDocument();
    expect(screen.getByText(/Minecraft End User License Agreement/i)).toBeInTheDocument();

    // Switch to Modpack Server tab
    fireEvent.click(screen.getByText("Modpack Server"));
    expect(screen.getByText("Modrinth")).toBeInTheDocument();
    expect(screen.getByText("CurseForge")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search Modrinth modpacks/i)).toBeInTheDocument();

    // Verify Cancel and close button triggers onClose
    const cancelBtn = screen.getByTitle("Cancel and close");
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it("does not render CreateServerModal when isOpen is false", () => {
    const handleClose = vi.fn();
    const handleCreated = vi.fn();

    const { container } = render(
      <CreateServerModal
        isOpen={false}
        onClose={handleClose}
        onServerCreated={handleCreated}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Create New Server")).not.toBeInTheDocument();
  });

  it("renders ConfigEditor tabs and supports visual/raw toggling", async () => {
    render(<ConfigEditor server={mockServer} />);

    expect(screen.getByText("Server Configuration")).toBeInTheDocument();
    expect(screen.getByText("Visual Settings")).toBeInTheDocument();
    expect(screen.getByText("Raw Editor")).toBeInTheDocument();

    // Switch to Raw Editor
    fireEvent.click(screen.getByText("Raw Editor"));
    expect(screen.getByText(/Editing/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/server\.properties content/i)).toBeInTheDocument();
  });

  it("renders ShareServerModal with Portal tunnel statuses and controls", async () => {
    const handleClose = vi.fn();
    render(
      <ShareServerModal
        server={mockServer}
        serverStatus={{ state: "running", port: 25565 }}
        isOpen={true}
        onClose={handleClose}
      />
    );

    expect(screen.getByText(/Share with Friends/i)).toBeInTheDocument();
    expect(screen.getByText("Minecraft Server")).toBeInTheDocument();
    expect(screen.getByText("Portal Tunnel")).toBeInTheDocument();
    expect(screen.getByText("Public Connectivity")).toBeInTheDocument();
    expect(screen.getByText("Enable Public Access")).toBeInTheDocument();
  });
});
