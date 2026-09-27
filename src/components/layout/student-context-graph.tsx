export function StudentContextGraph() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] hidden overflow-hidden opacity-[0.025] xl:block">
      <svg viewBox="0 0 960 640" preserveAspectRatio="xMidYMid slice" className="context-graph-drift absolute left-[24%] top-[10%] h-[82vh] w-[72vw] text-primary blur-[0.4px]">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M160 328 315 186 490 256 658 138 810 244" />
          <path d="M160 328 334 438 490 256 610 432 810 244" />
          <path d="M315 186 375 92 658 138 722 516 610 432 334 438" />
          <path d="M490 256 722 516" />
        </g>
        <g fill="var(--primary)" stroke="var(--background)" strokeWidth="5">
          <circle cx="160" cy="328" r="9" /><circle cx="315" cy="186" r="7" /><circle cx="490" cy="256" r="12" />
          <circle cx="658" cy="138" r="8" /><circle cx="810" cy="244" r="7" /><circle cx="334" cy="438" r="8" />
          <circle cx="610" cy="432" r="8" /><circle cx="722" cy="516" r="7" /><circle cx="375" cy="92" r="6" />
        </g>
      </svg>
    </div>
  );
}
