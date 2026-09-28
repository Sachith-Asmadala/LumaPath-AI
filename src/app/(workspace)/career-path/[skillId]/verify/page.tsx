"use client";
import { useParams } from "next/navigation";
import { SkillVerification } from "@/features/career/components/skill-verification";
export default function SkillVerificationPage() { const { skillId } = useParams<{ skillId: string }>(); return <SkillVerification key={skillId} skillId={skillId} />; }
