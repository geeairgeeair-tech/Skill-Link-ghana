/**
 * A posted job is editable by its owner ONLY while it is still open — that is,
 * before a professional has been accepted. Once a pro is accepted the job is
 * permanently locked; completing, cancelling or closing never restores editing.
 * Mirrors the backend rule in customer_update_job_request.
 */
export function isJobEditable(
  jobStatus: string | null | undefined,
  _bookingStatus?: string | null,
): boolean {
  return jobStatus === "open";
}
