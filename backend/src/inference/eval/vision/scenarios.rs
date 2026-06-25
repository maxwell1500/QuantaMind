//! Bundled vision OCR scenarios: small synthetic text PNGs (`include_bytes!`) + the ground-truth
//! collection JSON (`include_str!`). The first `include_bytes!` precedent in the codebase — the
//! images are deliberately tiny (a few KB each) so the binary doesn't bloat.

use crate::inference::eval::vision::spec::VisionCollection;

/// Bundled images by id. Tiny synthetic text renders (keep this set small — baked into the binary).
const VISION_IMAGES: &[(&str, &[u8])] = &[
    ("receipt", include_bytes!("scenarios/receipt.png")),
    ("note", include_bytes!("scenarios/note.png")),
    ("form", include_bytes!("scenarios/form.png")),
];

/// Bundled OCR collections by id: `(id, ground-truth JSON)`.
pub const VISION_COLLECTIONS: &[(&str, &str)] = &[("easy-ocr", include_str!("scenarios/easy-ocr.json"))];

/// Raw bytes of a bundled image, or `None` for an unknown id.
pub fn image_bytes(id: &str) -> Option<&'static [u8]> {
    VISION_IMAGES.iter().find(|(i, _)| *i == id).map(|(_, b)| *b)
}

/// Base64 of a bundled image (for the Ollama `images` field + the report's frontend payload).
pub fn image_base64(id: &str) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    image_bytes(id).map(|b| STANDARD.encode(b))
}

/// Parse a bundled collection by id (`None` for an unknown id or malformed JSON).
pub fn vision_collection(id: &str) -> Option<VisionCollection> {
    let json = VISION_COLLECTIONS.iter().find(|(i, _)| *i == id).map(|(_, j)| *j)?;
    serde_json::from_str(json).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_images_round_trip_through_base64_and_are_valid_pngs() {
        // The new include_bytes!→base64 asset path: a malformed/mis-encoded asset would make Ollama
        // reject the image (a confusing "model failure"). Assert each image base64-round-trips to
        // the same bytes AND begins with the PNG magic signature.
        use base64::{engine::general_purpose::STANDARD, Engine};
        const PNG_MAGIC: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        for (id, bytes) in VISION_IMAGES {
            assert!(bytes.starts_with(PNG_MAGIC), "{id} is not a PNG");
            assert!(bytes.len() < 64 * 1024, "{id} too large ({} bytes) — keep bundled images tiny", bytes.len());
            let decoded = STANDARD.decode(image_base64(id).unwrap()).unwrap();
            assert_eq!(&decoded, bytes, "{id} base64 did not round-trip");
        }
    }

    #[test]
    fn bundled_collection_loads_and_every_task_has_a_bundled_image() {
        let c = vision_collection("easy-ocr").expect("easy-ocr loads");
        assert!(!c.tasks.is_empty());
        for t in &c.tasks {
            assert!(image_bytes(&t.image).is_some(), "task {} references missing image {}", t.id, t.image);
            assert!(!t.ground_truth.trim().is_empty(), "task {} has empty ground truth", t.id);
        }
    }
}
