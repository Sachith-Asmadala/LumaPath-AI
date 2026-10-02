"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { workspaceGroups } from "@/components/layout/workspace-map";
import { useLocale } from "@/i18n/locale-provider";
import { Button } from "@/components/ui/button";

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const { t } = useLocale();
  const groups = workspaceGroups.filter((group) => category === "all" || group.id === category).map((group) => ({ ...group, links: group.links.filter((link) => `${t(link.labelKey)} ${link.description} ${group.title}`.toLowerCase().includes(query.toLowerCase().trim())) })).filter((group) => group.links.length > 0);
  return <div className="workspace-directory">
    <header className="directory-heading"><p className="workspace-eyebrow">A PLACE FOR EVERYTHING</p><h1>What would you like to do?</h1><p>Find the right tool for the next step. Everything in your workspace, organized.</p></header>
    <div className="directory-controls"><label className="directory-search"><Search size={20} /><input aria-label="Search workspace tools" placeholder="Search tasks, learning, careers..." value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={17} /></button>}</label><div className="directory-filters" aria-label="Tool categories"><button aria-pressed={category === "all"} onClick={() => setCategory("all")}>All tools</button>{workspaceGroups.map((group) => <button key={group.id} aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.title}</button>)}</div></div>
    <div aria-live="polite">{groups.length === 0 && <div className="workspace-empty"><Search className="mx-auto mb-4 text-muted-foreground" /><h2 className="text-lg font-medium">No tools found</h2><p className="mt-2 text-sm text-muted-foreground">Try a broader search or choose another category.</p><Button variant="outline" className="mt-5" onClick={() => { setQuery(""); setCategory("all"); }}>Clear filters</Button></div>}</div>
    {groups.map((group) => <section key={group.id} className="directory-section"><div className="directory-section-heading"><span className={`directory-group-icon tone-${group.id}`}><group.icon size={20} /></span><div><h2>{group.title}</h2><p>{group.description}</p></div><span className="directory-count">{group.links.length} tools</span></div><div className="directory-grid">{group.links.map((link) => <Link key={link.href} href={link.href} className="directory-tool"><span className={`directory-tool-icon tone-${group.id}`}><link.icon size={21} strokeWidth={1.6} /></span><ArrowUpRight size={17} className="directory-tool-arrow" /><h3>{t(link.labelKey)}</h3><p>{link.description}</p></Link>)}</div></section>)}
  </div>;
}
