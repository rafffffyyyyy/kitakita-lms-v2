"use client";
import React from "react";
import {
  FilmIcon,
  DocumentTextIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import YouTubeViewer from "./viewers/YouTubeViewer";
import FileViewer from "./viewers/FileViewer";
import AssignmentViewer, {
  Assignment,
  AssignmentFile,
} from "./viewers/AssignmentViewer";
import AddQuiz from "@/app/components/AddQuiz";

interface Props {
  src: string | null;            // resource url OR "ADD_QUIZ"
  assignment: Assignment | null; // when viewing an assignment
  assignmentFiles: AssignmentFile[];
  moduleId: string;              // ✅ added moduleId prop
}

const isYouTubeUrl = (url: string) =>
  url?.toLowerCase().includes("youtube.com") ||
  url?.toLowerCase().includes("youtu.be");

export default function ModuleViewer({ src, assignment, assignmentFiles, moduleId }: Props) {
  const Header = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
        {icon}
      </div>
      <h2 className="text-base sm:text-lg font-semibold text-slate-900">{title}</h2>
    </div>
  );

  // 1) Assignment
  if (assignment) {
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={<ClipboardDocumentCheckIcon className="h-5 w-5 text-emerald-600" />}
          title="Assignment"
        />
        <div className="h-[calc(100%-56px)]">
          <AssignmentViewer assignment={assignment} assignmentFiles={assignmentFiles} />
        </div>
      </div>
    );
  }

  // 2) Add Quiz
  if (src === "ADD_QUIZ") {
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={<ClipboardDocumentCheckIcon className="h-5 w-5 text-orange-600" />}
          title="Add Quiz"
        />
        <div className="h-[calc(100%-56px)] p-4">
          {/* ✅ Pass moduleId down */}
          <AddQuiz moduleId={moduleId} />
        </div>
      </div>
    );
  }

  // 3) File / Video
  if (src) {
    const isYT = isYouTubeUrl(src);
    return (
      <div className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Header
          icon={
            isYT ? (
              <FilmIcon className="h-5 w-5 text-red-600" />
            ) : (
              <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
            )
          }
          title={isYT ? "Video Preview" : "File Preview"}
        />
        <div className="h-[calc(100%-56px)] p-4">
          <div className="h-full w-full overflow-hidden rounded-xl ring-1 ring-slate-200 bg-white">
            {isYT ? <YouTubeViewer url={src} /> : <FileViewer src={src} />}
          </div>
        </div>
      </div>
    );
  }

  // 4) Empty
  return (
    <div className="h-full w-full rounded-xl border border-dashed border-slate-300 bg-white/70 grid place-items-center">
      <div className="text-center p-10">
        <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200">
          <DocumentTextIcon className="h-6 w-6 text-slate-500" />
        </div>
        <p className="text-slate-600">
          Select a file, video, or assignment from the sidebar to preview.
        </p>
        <p className="text-xs mt-1 text-slate-400">
          Inline previews are shown here.
        </p>
      </div>
    </div>
  );
}
