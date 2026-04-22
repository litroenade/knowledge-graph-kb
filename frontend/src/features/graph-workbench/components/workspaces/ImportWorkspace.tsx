import type { SystemReady } from '../../../../shared/types/kb';
import { ImportPanel } from '../panels/ImportPanel';
import { ModelConfigPopover } from './ModelConfigPopover';

interface ImportWorkspaceProps {
  ready: SystemReady | null;
  on_import_finished: () => void;
}

const IMPORT_FLOW_STEPS = [
  ['选择输入', '粘贴文本、上传文件或扫描目录'],
  ['解析策略', '选择 auto、plain、table 或 openie'],
  ['预览确认', '提交前检查内容、文件和路径'],
  ['执行导入', '跟踪任务、分块、失败与重试'],
  ['刷新图谱', '导入完成后同步图谱数据'],
];

export function ImportWorkspace(props: ImportWorkspaceProps) {
  return (
    <section aria-label='导入中心' className='workspace-stage'>
      <header className='workspace-header'>
        <div>
          <span>Import</span>
          <h1>导入中心</h1>
          <p>按任务流完成输入、解析、预览、执行和结果确认，导入完成后刷新图谱数据。</p>
        </div>
        <div className='workspace-header-actions'>
          <ModelConfigPopover
            button_label='模型配置'
            dialog_label='导入模型配置'
            mode='import'
            on_saved={props.on_import_finished}
            ready={props.ready}
          />
        </div>
      </header>

      <div className='workspace-content import-workspace'>
        <aside aria-label='导入流程' className='workspace-process'>
          <div className='process-heading'>
            <span>Workflow</span>
            <strong>导入流程</strong>
          </div>
          <ol className='process-steps'>
            {IMPORT_FLOW_STEPS.map(([title, description], index) => (
              <li key={title}>
                <b>{index + 1}</b>
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <div className='workspace-primary import-workspace-main'>
          <ImportPanel on_import_finished={props.on_import_finished} />
        </div>
      </div>
    </section>
  );
}
