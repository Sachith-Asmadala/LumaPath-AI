"use client";

import { useState, type FormEvent } from "react";
import { Download, ExternalLink, FileBadge2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completionEligibility, externalCertificateEvidence, type ExternalCertificateInput } from "@/features/learning/domain/learning";
import { useDemo } from "@/state/demo-provider";

export function LearningRecords() {
  const { state, learningAction } = useDemo();
  const [message, setMessage] = useState("");
  const [input, setInput] = useState<ExternalCertificateInput>({ title: "", provider: "", course: "", skillId: state.careerSkills[0]?.id ?? "", completedAt: "", url: "", credentialId: "" });
  const update = (key: keyof ExternalCertificateInput, value: string) => { setInput((current) => ({ ...current, [key]: value })); setMessage(""); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const at = new Date().toISOString();
    if (!externalCertificateEvidence(state, input, at)) { setMessage("Check your details: use a unique HTTPS certificate URL, an existing skill, and a valid completion date that is not in the future."); return; }
    learningAction({ type: "add-certificate", input, at });
    setInput({ ...input, title: "", provider: "", course: "", completedAt: "", url: "", credentialId: "" });
    setMessage("Certificate saved as self-reported. LumaPath has not verified the provider’s credential.");
  };
  const download = (record: typeof state.completionRecords[number]) => {
    const blob = new Blob([JSON.stringify({ ...record, notice: "Browser-local LumaPath prototype completion record. Learning and project submission are learner-reported. Assessment is a local knowledge check. Not accredited, identity-verified, or equivalent to an external provider credential." }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `lumapath-${record.skillId}-completion.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section id="learning-records" className="mt-7 scroll-mt-24 space-y-4" aria-label="Certificates and completion records">
    <div><p className="type-eyebrow mb-2 text-primary">Keep the evidence</p><h2 className="font-heading text-xl">Certificates & completion records</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Record credentials you earned elsewhere, and keep a local record of your assessed LumaPath learning.</p></div>
    <details className="rounded-2xl border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-medium">Add an external certificate</summary><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">{([{ key: "title", label: "Certificate title", type: "text" }, { key: "provider", label: "Provider", type: "text" }, { key: "course", label: "Course name", type: "text" }, { key: "completedAt", label: "Completion date", type: "date" }, { key: "url", label: "Certificate URL", type: "url" }, { key: "credentialId", label: "Credential ID (optional)", type: "text" }] as const).map(({ key, label, type }) => <div key={key} className="space-y-2"><Label htmlFor={`certificate-${key}`}>{label}</Label><Input id={`certificate-${key}`} type={type} required={key !== "credentialId"} maxLength={key === "url" ? 2000 : 160} value={input[key]} onChange={(event) => update(key, event.target.value)} className="h-11" /></div>)}<div className="space-y-2"><Label htmlFor="certificate-skill">Related skill</Label><select id="certificate-skill" className="workspace-select w-full" value={input.skillId} onChange={(event) => update("skillId", event.target.value)}>{state.careerSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></div><div className="self-end"><Button type="submit" className="h-11 rounded-xl">Save certificate</Button></div><p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Only add certificates you actually earned. These records do not automatically verify skills or increase readiness.</p><p role="status" className="text-sm text-primary sm:col-span-2">{message}</p></form></details>
    <div className="grid gap-3 lg:grid-cols-2">{state.evidence.filter((item) => item.kind === "external-certificate").map((item) => <Card key={item.id} className="rounded-2xl p-5"><p className="text-xs text-muted-foreground">External · self-reported</p><h3 className="mt-2 font-heading text-lg">{item.label}</h3><p className="mt-1 text-sm text-muted-foreground">{item.provider} · {item.course}</p><p className="mt-2 text-xs text-muted-foreground">Completed {item.completedAt}{item.credentialId ? ` · ID ${item.credentialId}` : ""}</p><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline" className="h-11 text-xs"><a href={item.url} target="_blank" rel="noopener noreferrer">Open certificate<ExternalLink className="size-3.5" /></a></Button><Button variant="ghost" className="h-11 text-xs" onClick={() => learningAction({ type: "remove-personal-evidence", evidenceId: item.id })}><Trash2 className="size-3.5" />Remove record</Button></div></Card>)}
    {state.completionRecords.map((record) => {
      const valid = completionEligibility(state, record.skillId).eligible;
      return <Card key={record.id} className="rounded-2xl border-primary/20 bg-primary/[0.035] p-5"><FileBadge2 className="size-6 text-primary" /><p className="mt-3 text-xs text-muted-foreground">LumaPath local completion record</p><h3 className="mt-1 font-heading text-lg">{record.title}</h3><p className="mt-2 text-sm">{record.studentName} · {new Date(record.completedAt).toLocaleDateString()}</p><p className="mt-2 text-xs">Knowledge check: {record.assessmentScore}% · Project submitted</p><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{record.id}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{valid ? "Completion requirements are present in this browser." : "The supporting local progress has changed."} This is not a publicly verified or accredited certificate.</p><Button disabled={!valid} variant="outline" className="mt-4 h-11 text-xs" onClick={() => download(record)}><Download className="size-3.5" />Download completion record</Button></Card>;
    })}</div>
    {!state.completionRecords.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Your internal completion records will appear after you finish a learning path, submit its project, and pass its assessment.</p>}
  </section>;
}
