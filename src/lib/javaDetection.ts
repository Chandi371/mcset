import { JavaRuntime, ServerProfile } from "../types";

export interface RecommendedJava {
  major: number;
  label: string;
  reason: string;
}

export interface JavaIssue {
  detected: boolean;
  targetMajor: number;
  currentMajor?: number;
  reason: string;
  source: string;
}

/**
 * Returns recommended Java version for a given Minecraft version string (e.g. "1.21.1", "1.20.1", "1.16.5", "26.3").
 * If `manifestMajor` is supplied from Mojang's official version manifest, it is given authoritative precedence.
 */
export function getRecommendedJava(
  mcVersion?: string | null,
  manifestMajor?: number | null
): RecommendedJava {
  // 1. Authoritative: Use exact major version from Mojang's Version Manifest if available
  if (manifestMajor && manifestMajor > 0) {
    const isLts = manifestMajor === 21 || manifestMajor === 17 || manifestMajor === 8;
    return {
      major: manifestMajor,
      label: `Java ${manifestMajor}${isLts ? " (LTS)" : ""}`,
      reason: `Minecraft ${mcVersion || ""} requires Java ${manifestMajor} (from Mojang version manifest)`,
    };
  }

  if (!mcVersion) {
    return {
      major: 21,
      label: "Java 21 (LTS)",
      reason: "Recommended for modern Minecraft releases",
    };
  }

  const clean = mcVersion.trim().replace(/^v/i, "");
  const parts = clean.split(".").map((p) => parseInt(p, 10));
  const major = parts[0] || 1;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;

  // Minecraft 26.x+ (e.g. 26.3, 26w...)
  if (major >= 26) {
    return {
      major: 25,
      label: "Java 25",
      reason: `Minecraft ${mcVersion} requires Java 25`,
    };
  }

  if (major === 1) {
    // Minecraft 1.20.5+ requires Java 21
    if (minor > 20 || (minor === 20 && patch >= 5)) {
      return {
        major: 21,
        label: "Java 21 (LTS)",
        reason: `Minecraft ${mcVersion} requires Java 21`,
      };
    }
    // Minecraft 1.18 - 1.20.4 requires Java 17
    if (minor >= 18) {
      return {
        major: 17,
        label: "Java 17 (LTS)",
        reason: `Minecraft ${mcVersion} requires Java 17`,
      };
    }
    // Minecraft 1.17 requires Java 16 or 17
    if (minor === 17) {
      return {
        major: 17,
        label: "Java 17 (LTS)",
        reason: `Minecraft 1.17 requires Java 16/17`,
      };
    }
    // Minecraft 1.16.5 and older requires Java 8
    return {
      major: 8,
      label: "Java 8 (Legacy)",
      reason: `Minecraft ${mcVersion} requires Java 8`,
    };
  }

  // Future 2.x or unknown
  return {
    major: 21,
    label: "Java 21 (LTS)",
    reason: `Minecraft ${mcVersion} requires Java 21`,
  };
}

/**
 * Scans recent console logs and server status to detect Java mismatch/incompatibility errors.
 */
export function detectJavaIssue(
  logs: string[],
  server?: ServerProfile | null,
  statusErrorMessage?: string | null
): JavaIssue | null {
  // Check the last 150 log lines
  const recentLogs = logs.slice(-150);

  // 1. Fabric FormattedException / Mod requirement:
  // e.g. "Replace 'OpenJDK 64-Bit Server VM' (java) 25 with version 21"
  const replaceRegex = /Replace '.*?' \(java\) (\d+) with version (\d+)/i;
  // e.g. "requires version 21 of 'OpenJDK 64-Bit Server VM' (java) ... but only the wrong version is present: 25!"
  const modReqRegex = /requires version (\d+) of '.*?\(java\)'.*?wrong version is present:\s*(\d+)/i;
  // e.g. "replace [[java 25] -> add:java 21"
  const fixRegex = /replace \[\[java (\d+)\]\s*->\s*add:java (\d+)/i;
  // e.g. "Mod 'Cobblemon' 1.7.3+1.21.1 requires version 21 ... but only the wrong version is present: 25"
  const generalWrongVer = /Mod '([^']+)' .*? requires version (\d+) .*? but only the wrong version is present:\s*(\d+)/i;

  // 2. Java class file version errors:
  // e.g. "has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0"
  const classFileRegex = /class file version (\d+)\.0.*?only recognizes class file versions up to (\d+)\.0/i;

  // 3. Explicit Minecraft java requirement:
  const mcReqRegex = /(?:Minecraft|server).*?(?:requires|needs) Java (\d+)/i;
  const javaReqRegex = /(?:requires|needs) Java (\d+)/i;
  const javaRequiredRegex = /Java (\d+) is required/i;

  for (let i = recentLogs.length - 1; i >= 0; i--) {
    const line = recentLogs[i];

    const modReqMatch = line.match(modReqRegex);
    if (modReqMatch) {
      const target = parseInt(modReqMatch[1], 10);
      const current = parseInt(modReqMatch[2], 10);
      return {
        detected: true,
        targetMajor: target,
        currentMajor: current,
        reason: `Mods require Java ${target}, but Java ${current} is currently used.`,
        source: line,
      };
    }

    const replaceMatch = line.match(replaceRegex);
    if (replaceMatch) {
      const current = parseInt(replaceMatch[1], 10);
      const target = parseInt(replaceMatch[2], 10);
      return {
        detected: true,
        targetMajor: target,
        currentMajor: current,
        reason: `Incompatible Java runtime: Java ${target} is required (currently using Java ${current}).`,
        source: line,
      };
    }

    const fixMatch = line.match(fixRegex);
    if (fixMatch) {
      const current = parseInt(fixMatch[1], 10);
      const target = parseInt(fixMatch[2], 10);
      return {
        detected: true,
        targetMajor: target,
        currentMajor: current,
        reason: `Loader recommends replacing Java ${current} with Java ${target}.`,
        source: line,
      };
    }

    const genWrongMatch = line.match(generalWrongVer);
    if (genWrongMatch) {
      const modName = genWrongMatch[1];
      const target = parseInt(genWrongMatch[2], 10);
      const current = parseInt(genWrongMatch[3], 10);
      return {
        detected: true,
        targetMajor: target,
        currentMajor: current,
        reason: `Mod '${modName}' requires Java ${target}, but Java ${current} is present.`,
        source: line,
      };
    }

    const classMatch = line.match(classFileRegex);
    if (classMatch) {
      const compiledClass = parseInt(classMatch[1], 10);
      const currentMaxClass = parseInt(classMatch[2], 10);
      const target = compiledClass >= 45 ? compiledClass - 44 : 21;
      const current = currentMaxClass >= 45 ? currentMaxClass - 44 : undefined;
      return {
        detected: true,
        targetMajor: target,
        currentMajor: current,
        reason: `Server/mods were compiled for Java ${target} (class file ${compiledClass}), but running runtime only supports up to Java ${current || "older"}.`,
        source: line,
      };
    }

    const mcReqMatch = line.match(mcReqRegex) || line.match(javaReqRegex) || line.match(javaRequiredRegex);
    if (mcReqMatch) {
      const target = parseInt(mcReqMatch[1], 10);
      return {
        detected: true,
        targetMajor: target,
        reason: `Minecraft requires Java ${target} to run.`,
        source: line,
      };
    }
  }

  // Check if status error message or server crash indicates Java incompatibility
  if (statusErrorMessage && statusErrorMessage.toLowerCase().includes("java")) {
    const rec = getRecommendedJava(server?.minecraft_version);
    return {
      detected: true,
      targetMajor: rec.major,
      reason: statusErrorMessage,
      source: statusErrorMessage,
    };
  }

  return null;
}

/**
 * Finds a matching runtime from a detected list for the target major version.
 */
export function findMatchingRuntime(
  runtimes: JavaRuntime[],
  targetMajor: number
): JavaRuntime | undefined {
  return runtimes.find(
    (r) =>
      r.major_version === targetMajor ||
      r.version_str === String(targetMajor) ||
      r.version_str.startsWith(`${targetMajor}.`) ||
      (targetMajor === 8 && (r.version_str.startsWith("1.8") || r.major_version === 8))
  );
}
