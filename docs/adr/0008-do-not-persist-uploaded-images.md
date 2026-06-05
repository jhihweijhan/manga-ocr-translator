# Do Not Persist Uploaded Images

Uploaded images are processed only for the current OCR request and are not saved by the backend. The first version has no task history, and avoiding image persistence reduces privacy risk, cleanup requirements, and storage behavior that would otherwise need explicit product design.
