use crate::commands::system::hardware::HardwareSnapshot;

/// Lowercase, hyphen-separated slug of a hardware string ("NVIDIA GeForce RTX
/// 4090" → "nvidia-geforce-rtx-4090"). Deterministic across machines so the same
/// hardware always maps to the same cohort token.
fn slug(s: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            out.extend(c.to_ascii_lowercase().to_string().chars());
            pending_dash = false;
        } else {
            pending_dash = true;
        }
    }
    out
}

/// Coarse memory tier from total system RAM (GiB) — the headroom that decides
/// whether a model class even fits, so verdicts in a tier are comparable.
fn mem_tier(bytes: u64) -> &'static str {
    match bytes / (1024 * 1024 * 1024) {
        0..=8 => "0-8gb",
        9..=16 => "8-16gb",
        17..=32 => "16-32gb",
        33..=64 => "32-64gb",
        65..=128 => "64-128gb",
        _ => "128gb+",
    }
}

fn cpu_vendor(cpu: &str) -> &'static str {
    let l = cpu.to_lowercase();
    if l.contains("amd") || l.contains("ryzen") || l.contains("epyc") || l.contains("threadripper") {
        "amd"
    } else if l.contains("intel") || l.contains("xeon") || l.contains("pentium") || l.contains("celeron") {
        "intel"
    } else if l.contains("qualcomm") || l.contains("snapdragon") {
        "qualcomm"
    } else {
        "cpu"
    }
}

/// Strip the vendor prefix from a CPU model name for the cohort slug.
/// "Intel Core i7-12700K" → "i7-12700k", "AMD Ryzen 9 5900X 12-Core Processor" → "ryzen-9-5900x".
fn cpu_model(cpu: &str) -> String {
    let l = cpu.to_lowercase();
    for prefix in &["intel core ", "intel ", "amd ", "qualcomm snapdragon "] {
        if let Some(rest) = l.strip_prefix(prefix) {
            let tokens: Vec<&str> = rest.split_whitespace().collect();
            let mut model_tokens = Vec::new();
            for tok in &tokens {
                let t = tok.trim();
                // Stop at known suffixes: "processor", "64-bit", "32-bit"
                if ["processor", "64-bit", "32-bit"].contains(&t.as_ref()) {
                    break;
                }
                // Stop at "12-core", "24-core" etc (number-hyphen-core)
                if let Some((num, rest)) = t.split_once('-') {
                    if num.chars().all(|c| c.is_ascii_digit())
                        && ["core", "threads"].contains(&rest)
                    {
                        break;
                    }
                }
                // Stop at standalone number like "12" followed by "core"/"processor"
                if t.chars().all(|c| c.is_ascii_digit()) {
                    // Check if next token is a suffix
                    if let Some(next) = tokens.iter().position(|x| *x == t).and_then(|i| tokens.get(i + 1)) {
                        let n = next.to_lowercase();
                        if n == "core" || n == "processor" || n.ends_with("-bit") {
                            break;
                        }
                    }
                }
                model_tokens.push(t);
            }
            if !model_tokens.is_empty() {
                return slug(&model_tokens.join(" "));
            }
        }
    }
    slug(cpu)
}

fn gpu_vendor(name: &str) -> &'static str {
    let l = name.to_lowercase();
    if ["nvidia", "geforce", "rtx", "gtx", "tesla", "quadro"].iter().any(|t| l.contains(t)) {
        "nvidia"
    } else if ["radeon", "amd", "instinct"].iter().any(|t| l.contains(t)) {
        "amd"
    } else if l.contains("intel") || l.contains("arc") {
        "intel"
    } else {
        "gpu"
    }
}

/// Apple chip class from the CPU brand ("Apple M3 Pro" → "m3-pro"). Coarse enough
/// to pool a real population, specific enough that an M1 and an M4 Max don't share
/// a cohort.
fn apple_class(cpu: &str) -> String {
    let l = cpu.to_lowercase();
    for tok in l.split_whitespace() {
        let mut ch = tok.chars();
        if ch.next() == Some('m') && ch.next().is_some_and(|c| c.is_ascii_digit()) {
            let tier = ["ultra", "max", "pro"].iter().find(|t| l.contains(**t));
            return tier.map_or_else(|| tok.to_string(), |t| format!("{tok}-{t}"));
        }
    }
    "apple-unknown".to_string()
}

/// Derive the hardware cohort key — `"{vendor}/{model}/{mem_tier}"`. Quant is a
/// SEPARATE dedup column, so it is NOT part of the cohort. CPU-only systems use the
/// actual CPU vendor and model name (e.g. "intel/i7-12700k/16-32gb") instead of just
/// the architecture, so different CPUs are distinguishable.
pub fn cohort_key(hw: &HardwareSnapshot) -> String {
    let (platform, accel) = if hw.is_apple_silicon {
        ("apple-silicon".to_string(), apple_class(&hw.cpu))
    } else if let Some(name) = hw.gpu.name.as_deref().filter(|_| hw.gpu.available) {
        (gpu_vendor(name).to_string(), slug(name))
    } else {
        (cpu_vendor(&hw.cpu).to_string(), cpu_model(&hw.cpu))
    };
    let accel = if accel.is_empty() { "unknown".to_string() } else { accel };
    format!("{platform}/{accel}/{}", mem_tier(hw.total_memory_bytes))
}

#[cfg(test)]
#[path = "cohort_tests.rs"]
mod tests;
