# Reject Invalid Model JSON

Model responses that do not match the expected structured JSON contract are treated as failures for that processing stage. The application deliberately avoids best-effort parsing or repair of malformed model prose because silent recovery would make OCR blocks and translations unreliable.
