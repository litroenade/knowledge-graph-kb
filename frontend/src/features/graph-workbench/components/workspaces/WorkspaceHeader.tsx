import type { ReactNode } from 'react';

interface WorkspaceHeaderProps {
  actions: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  className?: string;
}

export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const class_name = ['workspace-header', props.className].filter(Boolean).join(' ');

  return (
    <header className={class_name}>
      <div className='workspace-header-copy'>
        <span>{props.eyebrow}</span>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      <div aria-label='页面操作' className='workspace-header-actions'>
        {props.actions}
      </div>
    </header>
  );
}
