export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight text-ink">{title}</h1>
      {children && <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

export function PageHeading({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[2.1rem] leading-none font-bold tracking-tight text-ink sm:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-base text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}
