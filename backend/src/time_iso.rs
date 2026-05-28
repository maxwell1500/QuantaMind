use std::time::{SystemTime, UNIX_EPOCH};

/// UTC ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`) for the current moment.
pub fn now_utc() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format_secs(secs as i64)
}

fn format_secs(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (h, m, s) = (sod / 3600, (sod % 3600) / 60, sod % 60);
    let (y, mo, d) = civil_from_days(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

/// Howard Hinnant's days-from-civil inverse (proleptic Gregorian).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = (y + if m <= 2 { 1 } else { 0 }) as i32;
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_formats_as_expected() {
        assert_eq!(format_secs(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn known_timestamps_format_correctly() {
        assert_eq!(format_secs(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(format_secs(946_684_800), "2000-01-01T00:00:00Z");
        assert_eq!(format_secs(1_582_934_400), "2020-02-29T00:00:00Z");
    }

    #[test]
    fn now_utc_starts_with_a_century_digit() {
        let s = now_utc();
        assert!(s.starts_with("20") || s.starts_with("21"));
        assert_eq!(s.len(), 20);
        assert!(s.ends_with('Z'));
    }
}
