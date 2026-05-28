// Stub — module absent du commit. À remplacer par la vraie composition OPCO.
'use server';

export interface SubmissionAttachment {
  filename: string;
  size: number;
  contentType?: string;
}

export interface OpcoSubmissionDraft {
  subject: string;
  body: string;
  attachments: SubmissionAttachment[];
}

export async function getOpcoSubmission(_id: string): Promise<OpcoSubmissionDraft | null> {
  return null;
}
