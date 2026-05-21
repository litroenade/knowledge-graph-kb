import type { KBScope, SystemReady } from '../../../../shared/types/kb';
import { ChatPanel } from '../panels/ChatPanel';
import { WorkspaceHeader } from './WorkspaceHeader';
import { ModelConfigPopover } from './ModelConfigPopover';

interface ChatWorkspaceProps {
  ready: SystemReady | null;
  scope: KBScope;
  on_focus_node: (node_id: string) => void;
  on_saved: () => void;
}

const CHAT_AREAS = [
  ['会话', '保留历史问题和回答'],
  ['引用证据', '展示命中的段落、表格和来源'],
  ['检索上下文', '控制范围、top-k 与结构化检索'],
  ['模型参数', '问答 LLM 与引用策略入口'],
];

export function ChatWorkspace(props: ChatWorkspaceProps) {
  return (
    <section aria-label='知识问答' className='workspace-stage'>
      <WorkspaceHeader
        actions={
          <ModelConfigPopover
            button_label='模型配置'
            dialog_label='问答模型配置'
            mode='chat'
            on_saved={props.on_saved}
            ready={props.ready}
          />
        }
        description='基于当前来源范围进行检索增强问答，回答中的证据可反向聚焦图谱实体。'
        eyebrow='Chat'
        title='知识问答'
      />

      <div className='workspace-content chat-workspace'>
        <div className='workspace-primary chat-workspace-main'>
          <ChatPanel on_focus_node={props.on_focus_node} scope={props.scope} />
        </div>

        <aside aria-label='问答能力说明' className='workspace-context'>
          <div className='process-heading'>
            <span>Context</span>
            <strong>问答结构</strong>
          </div>
          <div className='context-list'>
            {CHAT_AREAS.map(([title, description]) => (
              <div key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </aside>

      </div>
    </section>
  );
}
