import type { FormEvent } from 'react';

interface GraphBrowserEntityDrawerProps {
  create_label: string;
  create_description: string;
  is_creating_node: boolean;
  on_close: () => void;
  on_create_label_change: (value: string) => void;
  on_create_description_change: (value: string) => void;
  on_submit: (event: FormEvent<HTMLFormElement>) => void;
}

export function GraphBrowserEntityDrawer(props: GraphBrowserEntityDrawerProps) {
  const {
    create_label,
    create_description,
    is_creating_node,
    on_close,
    on_create_label_change,
    on_create_description_change,
    on_submit,
  } = props;

  return (
    <form className='kb-graph-form' onSubmit={on_submit}>
      <div className='kb-graph-drawer-head'>
        <div>
          <span className='kb-context-label'>新建实体</span>
          <h3>新建手工实体</h3>
          <p>创建后会自动选中该实体，并可继续在右侧属性面板里编辑。</p>
        </div>
        <button className='kb-secondary-button' onClick={on_close} type='button'>
          关闭
        </button>
      </div>

      <label className='kb-form-field'>
        <span>实体名称</span>
        <input
          onChange={(event) => on_create_label_change(event.target.value)}
          placeholder='例如：项目 Alpha'
          value={create_label}
        />
      </label>

      <label className='kb-form-field'>
        <span>描述</span>
        <textarea
          onChange={(event) => on_create_description_change(event.target.value)}
          placeholder='补充实体说明，创建后会写入节点元数据。'
          value={create_description}
        />
      </label>

      <div className='kb-button-row'>
        <button
          className='kb-primary-button'
          disabled={is_creating_node || !create_label.trim()}
          type='submit'
        >
          {is_creating_node ? '创建中…' : '创建实体'}
        </button>
      </div>
    </form>
  );
}
