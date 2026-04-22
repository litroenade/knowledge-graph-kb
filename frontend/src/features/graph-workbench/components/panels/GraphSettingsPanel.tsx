interface GraphSettingsPanelProps {
  show_labels: boolean;
  density: number;
  local_depth: number;
  link_distance: number;
  repulsion: number;
  auto_save_layout: boolean;
  fixed_node_count: number;
  has_selected: boolean;
  layout_status: string;
  on_show_labels_change: (value: boolean) => void;
  on_density_change: (value: number) => void;
  on_local_depth_change: (value: number) => void;
  on_link_distance_change: (value: number) => void;
  on_repulsion_change: (value: number) => void;
  on_auto_save_layout_change: (value: boolean) => void;
  on_save_layout: () => void;
  on_restore_layout: () => void;
  on_reset_layout: () => void;
  on_fix_selected: () => void;
  on_release_selected: () => void;
  on_fix_neighborhood: () => void;
  on_release_all: () => void;
}

export function GraphSettingsPanel(props: GraphSettingsPanelProps) {
  return (
    <section className='control-section panel-body'>
      <div className='section-heading'>
        <span>Obsidian 图谱控制</span>
      </div>
      <label className='field is-inline'>
        <span>标签</span>
        <input
          checked={props.show_labels}
          onChange={(event) => props.on_show_labels_change(event.target.checked)}
          type='checkbox'
        />
      </label>
      <label className='field'>
        <span>密度 {props.density}%</span>
        <input
          max='100'
          min='20'
          onChange={(event) => props.on_density_change(Number(event.target.value))}
          type='range'
          value={props.density}
        />
      </label>
      <label className='field'>
        <span>局部深度 {props.local_depth}</span>
        <input
          max='3'
          min='1'
          onChange={(event) => props.on_local_depth_change(Number(event.target.value))}
          type='range'
          value={props.local_depth}
        />
      </label>
      <label className='field'>
        <span>连接距离 {props.link_distance}</span>
        <input
          max='180'
          min='48'
          onChange={(event) => props.on_link_distance_change(Number(event.target.value))}
          type='range'
          value={props.link_distance}
        />
      </label>
      <label className='field'>
        <span>斥力 {props.repulsion}</span>
        <input
          max='360'
          min='60'
          onChange={(event) => props.on_repulsion_change(Number(event.target.value))}
          type='range'
          value={props.repulsion}
        />
      </label>

      <div className='layout-tool'>
        <div className='section-heading'>
          <span>布局</span>
          <b>{props.fixed_node_count} 固定</b>
        </div>
        <label className='field is-inline'>
          <span>自动保存</span>
          <input
            checked={props.auto_save_layout}
            onChange={(event) => props.on_auto_save_layout_change(event.target.checked)}
            type='checkbox'
          />
        </label>
        <div className='button-row'>
          <button onClick={props.on_save_layout} type='button'>保存布局</button>
          <button onClick={props.on_restore_layout} type='button'>恢复布局</button>
          <button onClick={props.on_reset_layout} type='button'>重置布局</button>
        </div>
        <div className='button-row'>
          <button disabled={!props.has_selected} onClick={props.on_fix_selected} type='button'>固定选中</button>
          <button disabled={!props.has_selected} onClick={props.on_release_selected} type='button'>释放选中</button>
          <button disabled={!props.has_selected} onClick={props.on_fix_neighborhood} type='button'>固定邻域</button>
          <button onClick={props.on_release_all} type='button'>释放全部</button>
        </div>
        <p className='inline-message'>{props.layout_status}</p>
      </div>
    </section>
  );
}
