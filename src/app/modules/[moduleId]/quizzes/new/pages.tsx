// /app/modules/[moduleId]/quizzes/new/page.tsx
import AddQuiz from "@/app/components/AddQuiz";

export default function NewQuizPage({ params }: { params: { moduleId: string } }) {
  return <AddQuiz moduleId={params.moduleId} />;
}
