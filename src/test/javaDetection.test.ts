import { describe, it, expect } from "vitest";
import {
  getRecommendedJava,
  detectJavaIssue,
  findMatchingRuntime,
} from "../lib/javaDetection";
import { JavaRuntime } from "../types";

describe("Java Detection and Intelligent Recommendation Engine", () => {
  it("correctly identifies recommended Java version for Minecraft releases", () => {
    // 26.x (e.g. 26.3, 26w...) requires Java 25
    expect(getRecommendedJava("26.3").major).toBe(25);
    expect(getRecommendedJava("26.3", 25).major).toBe(25);
    expect(getRecommendedJava("26.3", 25).reason).toContain("from Mojang version manifest");

    // 1.20.5+ requires Java 21
    expect(getRecommendedJava("1.21.4").major).toBe(21);
    expect(getRecommendedJava("1.21.4", 21).major).toBe(21);
    expect(getRecommendedJava("1.21.1").major).toBe(21);
    expect(getRecommendedJava("1.20.6").major).toBe(21);
    expect(getRecommendedJava("1.20.5").major).toBe(21);

    // 1.18 - 1.20.4 requires Java 17
    expect(getRecommendedJava("1.20.4").major).toBe(17);
    expect(getRecommendedJava("1.20.1").major).toBe(17);
    expect(getRecommendedJava("1.19.4").major).toBe(17);
    expect(getRecommendedJava("1.18.2").major).toBe(17);

    // 1.17 requires Java 17 (or 16)
    expect(getRecommendedJava("1.17.1").major).toBe(17);

    // 1.16.5 and older requires Java 8
    expect(getRecommendedJava("1.16.5").major).toBe(8);
    expect(getRecommendedJava("1.12.2").major).toBe(8);
    expect(getRecommendedJava("1.8.9").major).toBe(8);
    expect(getRecommendedJava("1.7.10").major).toBe(8);

    // Default fallback
    expect(getRecommendedJava(null).major).toBe(21);
  });

  it("detects the user's exact Fabric loader & Cobblemon Java 25 mismatch crash", () => {
    const errorLogs = [
      "[17:42:01] [main/INFO]: Loading Minecraft 1.21.1 with Fabric Loader 0.16.9",
      "[17:42:02] [main/INFO]: Loading 128 mods: cobblemon 1.7.3+1.21.1, fabricloader 0.16.9, java 25",
      "[17:42:03] [main/ERROR]: Incompatible mods found! net.fabricmc.loader.impl.FormattedException: Replace 'OpenJDK 64-Bit Server VM' (java) 25 with version 21. Mod 'Cobblemon' 1.7.3+1.21.1 requires version 21 of 'OpenJDK 64-Bit Server VM' (java) via 'fabricloader', but only the wrong version is present: 25!",
      "[17:42:03] [main/INFO]: \t - Replace 'OpenJDK 64-Bit Server VM' (java) 25 with version 21.",
    ];

    const issue = detectJavaIssue(errorLogs, {
      id: "cobblemon-server",
      name: "Cobblemon Test",
      server_type: "fabric",
      minecraft_version: "1.21.1",
      java_path: "C:\\Program Files\\Java\\jdk-25\\bin\\java.exe",
      min_ram_mb: 2048,
      max_ram_mb: 4096,
      jvm_flags: "",
      server_dir: "C:\\mcset\\servers\\cobblemon",
      jar_file: "fabric-server.jar",
      port: 25565,
      eula_accepted: true,
      autostart: false,
      created_at: 0,
      updated_at: 0,
    });

    expect(issue).not.toBeNull();
    expect(issue?.detected).toBe(true);
    expect(issue?.targetMajor).toBe(21);
    expect(issue?.currentMajor).toBe(25);
    expect(issue?.reason).toContain("Java 21");
  });

  it("detects Java UnsupportedClassVersionError (class file 65.0 with runtime recognizing up to 61.0)", () => {
    const classErrorLogs = [
      "Exception in thread \"main\" java.lang.UnsupportedClassVersionError: net/minecraft/bundler/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0",
      "\tat java.base/java.lang.ClassLoader.defineClass1(Native Method)",
    ];

    const issue = detectJavaIssue(classErrorLogs, null);
    expect(issue).not.toBeNull();
    expect(issue?.detected).toBe(true);
    expect(issue?.targetMajor).toBe(21);
    expect(issue?.currentMajor).toBe(17);
  });

  it("detects general Minecraft requires Java log line", () => {
    const logs = [
      "[Server thread/ERROR]: Minecraft 1.20.5 requires Java 21 to run.",
    ];
    const issue = detectJavaIssue(logs, null);
    expect(issue).not.toBeNull();
    expect(issue?.targetMajor).toBe(21);
  });

  it("findMatchingRuntime accurately matches installed Java versions", () => {
    const runtimes: JavaRuntime[] = [
      {
        path: "C:\\Java\\jdk-25\\bin\\java.exe",
        version_str: "25.0.0",
        major_version: 25,
        vendor: "Oracle",
        is_valid: true,
        is_recommended: false,
      },
      {
        path: "C:\\Java\\jdk-17\\bin\\java.exe",
        version_str: "17.0.10",
        major_version: 17,
        vendor: "Eclipse Adoptium",
        is_valid: true,
        is_recommended: true,
      },
    ];

    // Java 21 is not present
    expect(findMatchingRuntime(runtimes, 21)).toBeUndefined();

    // Java 17 is present
    const match17 = findMatchingRuntime(runtimes, 17);
    expect(match17).toBeDefined();
    expect(match17?.major_version).toBe(17);
    expect(match17?.vendor).toBe("Eclipse Adoptium");

    // Java 25 is present
    const match25 = findMatchingRuntime(runtimes, 25);
    expect(match25).toBeDefined();
    expect(match25?.major_version).toBe(25);
  });
});
