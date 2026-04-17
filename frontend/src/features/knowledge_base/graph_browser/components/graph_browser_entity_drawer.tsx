import type { FormEvent } from 'react';

type CreateEntityScopeMode = 'global' | 'source';

interface GraphBrowserEntityDrawerProps {
  create_label: string;
  create_description: string;
  create_scope_mode: CreateEntityScopeMode;
  can_bind_to_source: boolean;
  is_creating_node: boolean;
  selected_source_name: string | null;
  on_close: () => void;
  on_create_label_change: (value: string) => void;
  on_create_description_change: (value: string) => void;
  on_create_scope_mode_change: (value: CreateEntityScopeMode) => void;
  on_submit: (event: FormEvent<HTMLFormElement>) => void;
}

const ENTITY_DRAWER_COPY = {
  context_label: '\u65b0\u5efa\u5b9e\u4f53',
  title: '\u65b0\u5efa\u624b\u5de5\u5b9e\u4f53',
  description: '\u521b\u5efa\u540e\u4f1a\u81ea\u52a8\u9009\u4e2d\u8be5\u5b9e\u4f53\uff0c\u5e76\u53ef\u7ee7\u7eed\u5728\u53f3\u4fa7\u5c5e\u6027\u9762\u677f\u91cc\u7f16\u8f91\u3002',
  close: '\u5173\u95ed',
  entity_label: '\u5b9e\u4f53\u540d\u79f0',
  entity_placeholder: '\u4f8b\u5982\uff1a\u9879\u76ee Alpha',
  scope_label: '\u5b9e\u4f53\u4f5c\u7528\u57df',
  global_scope: '\u5168\u5c40\u5b9e\u4f53',
  source_scope: '\u7ed1\u5b9a\u5f53\u524d\u6765\u6e90\u5feb\u7167',
  source_scope_disabled:
    '\u53ea\u6709\u5f53\u524d\u6536\u7a84\u5230\u5355\u4e00\u6765\u6e90\u65f6\uff0c\u624d\u80fd\u521b\u5efa\u7ed1\u5b9a\u6765\u6e90\u5feb\u7167\u7684\u624b\u5de5\u5b9e\u4f53\u3002',
  global_scope_description:
    '\u521b\u5efa\u540e\u4f1a\u4f5c\u4e3a\u5168\u5c40\u624b\u5de5\u5b9e\u4f53\u4fdd\u7559\uff0c\u4e0d\u968f\u5355\u4e2a\u6765\u6e90\u5220\u9664\u800c\u88ab\u6e05\u7406\u3002',
  description_label: '\u63cf\u8ff0',
  description_placeholder: '\u8865\u5145\u5b9e\u4f53\u8bf4\u660e\uff0c\u521b\u5efa\u540e\u4f1a\u5199\u5165\u8282\u70b9\u5143\u6570\u636e\u3002',
  submit: '\u521b\u5efa\u5b9e\u4f53',
  submitting: '\u521b\u5efa\u4e2d\u2026',
};

export function GraphBrowserEntityDrawer(props: GraphBrowserEntityDrawerProps) {
  const {
    create_label,
    create_description,
    create_scope_mode,
    can_bind_to_source,
    is_creating_node,
    selected_source_name,
    on_close,
    on_create_label_change,
    on_create_description_change,
    on_create_scope_mode_change,
    on_submit,
  } = props;

  const is_source_scope = create_scope_mode === 'source';
  const scope_description = is_source_scope
    ? can_bind_to_source
      ? `\u521b\u5efa\u540e\u4ec5\u7ed1\u5b9a\u5230\u5f53\u524d\u6765\u6e90\u5feb\u7167\uff1a${selected_source_name ?? '\u5f53\u524d\u6765\u6e90'}\u3002`
      : ENTITY_DRAWER_COPY.source_scope_disabled
    : ENTITY_DRAWER_COPY.global_scope_description;

  return (
    <form className='kb-graph-form' onSubmit={on_submit}>
      <div className='kb-graph-drawer-head'>
        <div>
          <span className='kb-context-label'>{ENTITY_DRAWER_COPY.context_label}</span>
          <h3>{ENTITY_DRAWER_COPY.title}</h3>
          <p>{ENTITY_DRAWER_COPY.description}</p>
        </div>
        <button className='kb-secondary-button' onClick={on_close} type='button'>
          {ENTITY_DRAWER_COPY.close}
        </button>
      </div>

      <label className='kb-form-field'>
        <span>{ENTITY_DRAWER_COPY.entity_label}</span>
        <input
          onChange={(event) => on_create_label_change(event.target.value)}
          placeholder={ENTITY_DRAWER_COPY.entity_placeholder}
          value={create_label}
        />
      </label>

      <div className='kb-form-field'>
        <span>{ENTITY_DRAWER_COPY.scope_label}</span>
        <div className='kb-mode-tabs'>
          <button
            className={`kb-pill-button ${create_scope_mode === 'global' ? 'is-active' : ''}`}
            onClick={() => on_create_scope_mode_change('global')}
            type='button'
          >
            {ENTITY_DRAWER_COPY.global_scope}
          </button>
          <button
            className={`kb-pill-button ${create_scope_mode === 'source' ? 'is-active' : ''}`}
            disabled={!can_bind_to_source}
            onClick={() => on_create_scope_mode_change('source')}
            type='button'
          >
            {ENTITY_DRAWER_COPY.source_scope}
          </button>
        </div>
        <span className='kb-context-label'>{scope_description}</span>
      </div>

      <label className='kb-form-field'>
        <span>{ENTITY_DRAWER_COPY.description_label}</span>
        <textarea
          onChange={(event) => on_create_description_change(event.target.value)}
          placeholder={ENTITY_DRAWER_COPY.description_placeholder}
          value={create_description}
        />
      </label>

      <div className='kb-button-row'>
        <button
          className='kb-primary-button'
          disabled={is_creating_node || !create_label.trim() || (is_source_scope && !can_bind_to_source)}
          type='submit'
        >
          {is_creating_node ? ENTITY_DRAWER_COPY.submitting : ENTITY_DRAWER_COPY.submit}
        </button>
      </div>
    </form>
  );
}
