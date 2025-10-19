"use client";

import { PaperClipIcon } from "@heroicons/react/24/outline";

type Props = {
  file_url: string | null;
  answer_text: string | null;
};

const isImage = (u: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u);
const isPDF = (u: string) => /\.pdf$/i.test(u);

export default function SubmissionViewer({ file_url, answer_text }: Props) {
  if (!file_url && !answer_text) {
    return (
      <div className="p-6 text-sm text-neutral-500">
        No content to display.
      </div>
    );
  }

  return (
    <div className="h-[calc(100%-56px)] overflow-auto bg-white">
      {answer_text && (
        <section className="p-6">
          <h3 className="text-xs font-medium text-neutral-500 mb-2">Answer Text</h3>
          <div className="rounded-2xl border border-neutral-200 p-4 whitespace-pre-wrap text-sm text-neutral-900 bg-white shadow-sm">
            {answer_text}
          </div>
        </section>
      )}

      {file_url && (
        <section className="p-6">
          <h3 className="text-xs font-medium text-neutral-500 mb-2 flex items-center gap-2">
            <PaperClipIcon className="w-4 h-4" /> Attached File
          </h3>
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            {isImage(file_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Submission" src={file_url} className="w-full rounded-2xl" />
            ) : isPDF(file_url) ? (
              <object
                data={file_url}
                type="application/pdf"
                className="w-full h-[72vh] rounded-2xl"
              >
                <p className="p-4 text-sm">
                  PDF preview not available.{" "}
                  <a className="underline text-blue-600" href={file_url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </p>
              </object>
            ) : (
              <div className="p-4 text-sm">
                Preview not supported.{" "}
                <a className="underline text-blue-600" href={file_url} target="_blank" rel="noreferrer">
                  Download file
                </a>
                .
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
