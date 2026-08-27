// Not "server-only" — this single constant is shared by server code
// (storage.ts) and client components that need to talk to the bucket
// directly (large PDF uploads via a signed upload URL, bypassing the
// Server Action body size limit entirely — see actions/pdf-upload.ts).
export const EL_PROFESOR_PDF_BUCKET = "el-profesor-pdfs";

// Same reasoning applies to images (book covers, flashcard images, fiche
// block illustrations): uploaded directly to Storage via a signed upload
// URL rather than as base64 through a Server Action — see
// actions/image-upload.ts and client-image-upload.ts.
export const EL_PROFESOR_COVER_BUCKET = "el-profesor-covers";
export const EL_PROFESOR_FLASHCARD_IMAGE_BUCKET = "el-profesor-flashcard-images";
export const EL_PROFESOR_BLOCK_IMAGE_BUCKET = "el-profesor-block-images";
