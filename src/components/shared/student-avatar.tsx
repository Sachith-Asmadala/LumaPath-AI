import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { StudentProfile } from "@/data/demo/types";

export function StudentAvatar({ student, className }: { student: StudentProfile; className?: string }) {
  const isDemo = student.id === "competition-student" || student.id === "student-sachith";
  const src = isDemo ? student.avatarUrl ?? "/demo/profile/sachith.png" : student.avatarUrl;
  return <Avatar className={className}>
    {src && <AvatarImage src={src} alt={`${student.name}'s profile picture`} className="object-cover" />}
    <AvatarFallback>{student.initials}</AvatarFallback>
  </Avatar>;
}
