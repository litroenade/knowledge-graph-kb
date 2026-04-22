interface GraphSettingsPanelProps {
  show_labels: boolean;
  density: number;
  local_depth: number;
  link_distance: number;
  repulsion: number;
  on_show_labels_change: (value: boolean) => void;
  on_density_change: (value: number) => void;
  on_local_depth_change: (value: number) => void;
  on_link_distance_change: (value: number) => void;
  on_repulsion_change: (value: number) => void;
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
    </section>
  );
}
