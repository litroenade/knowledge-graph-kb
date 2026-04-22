export function DetailBlock(props: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className='detail-block'>
      <strong>{props.title}</strong>
      {props.rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

export function PreviewList(props: { title: string; items: string[] }) {
  return (
    <div className='preview-list'>
      <strong>{props.title}</strong>
      {props.items.slice(0, 5).map((item, index) => (
        <p key={`${props.title}-${index}`}>{item}</p>
      ))}
    </div>
  );
}
