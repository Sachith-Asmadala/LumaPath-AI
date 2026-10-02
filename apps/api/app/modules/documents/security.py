from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import shutil
import subprocess
import zipfile


class FileValidationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class VerifiedFile:
    extension: str
    canonical_mime: str


_ALLOWED = {
    ".pdf": ("application/pdf",),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation",),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",),
    ".txt": ("text/plain",),
}


def verify_file(name: str, declared_mime: str | None, data: bytes, max_bytes: int) -> VerifiedFile:
    if not name or "." not in name:
        raise FileValidationError("Choose a supported PDF, PPTX, DOCX or TXT file.")
    extension = Path(name).suffix.lower()
    if extension not in _ALLOWED:
        raise FileValidationError("Unsupported file type. Use PDF, PPTX, DOCX or TXT.")
    if not data:
        raise FileValidationError("The selected file is empty.")
    if len(data) > max_bytes:
        raise FileValidationError(f"File is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.")

    canonical = _ALLOWED[extension][0]
    declared = (declared_mime or "").split(";", 1)[0].strip().lower()
    if declared and declared not in {canonical, "application/octet-stream", "application/zip", ""}:
        raise FileValidationError("The browser MIME type does not match the selected file format.")

    if extension == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise FileValidationError("This file does not have a valid PDF signature.")
    elif extension in {".pptx", ".docx"}:
        if not data.startswith(b"PK"):
            raise FileValidationError("This Office file does not have a valid ZIP-based signature.")
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" not in names:
                    raise FileValidationError("The Office document is corrupt or incomplete.")
                required_prefix = "ppt/" if extension == ".pptx" else "word/"
                if not any(item.startswith(required_prefix) for item in names):
                    raise FileValidationError("The file content does not match its extension.")
        except zipfile.BadZipFile as exc:
            raise FileValidationError("The Office document is corrupt or cannot be opened.") from exc
    else:
        if b"\x00" in data[:8192]:
            raise FileValidationError("The text file appears to contain unsupported binary content.")
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise FileValidationError("TXT uploads must use UTF-8 encoding.") from exc
    return VerifiedFile(extension=extension, canonical_mime=canonical)


class MalwareScanner:
    def __init__(self, require_scanner: bool = False) -> None:
        self.require_scanner = require_scanner
        self._command = shutil.which("clamscan")

    def scan(self, path: Path) -> str:
        if not self._command:
            if self.require_scanner:
                raise RuntimeError("Malware scanning is required but ClamAV is not available.")
            return "unavailable"
        result = subprocess.run(
            [self._command, "--no-summary", "--infected", str(path)],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode == 0:
            return "clean"
        if result.returncode == 1:
            raise FileValidationError("The uploaded file failed malware scanning and was not accepted.")
        raise RuntimeError("Malware scanner failed. Try again later.")
