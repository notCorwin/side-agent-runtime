"use client";

import {
  AuiIf,
  ActionBarPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  type ReasoningGroupComponent,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, SquareIcon, XIcon } from "lucide-react";
import { createContext, useContext, type ComponentType, type FC, type KeyboardEvent, type PropsWithChildren } from "react";
import { MarkdownText } from "./markdown-text";
import { Reasoning, ReasoningGroup } from "./reasoning";
import { ToolFallback } from "./tool-fallback";
import { ToolGroup } from "./tool-group";
import { TooltipIconButton } from "./tooltip-icon-button";
import { cn } from "@/lib/utils";

export type ThreadComponents = {
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?: ComponentType<PropsWithChildren<{ startIndex: number; endIndex: number }>> | undefined;
  ReasoningGroup?: ReasoningGroupComponent | undefined;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
};

const ThreadComponentsContext = createContext<ThreadComponents>({});

export const Thread: FC<ThreadProps> = ({ components = {} }) => (
  <ThreadComponentsContext.Provider value={components}>
    <ThreadRoot />
  </ThreadComponentsContext.Provider>
);

const ThreadRoot: FC = () => {
  const isEmpty = useContextualThreadEmpty();
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);

  return (
    <ThreadPrimitive.Root
      data-slot="aui_thread-root"
      data-testid="thread-root"
      className="aui-root aui-thread-root flex h-full min-h-0 flex-col bg-background"
    >
      <ThreadPrimitive.Viewport
        data-slot="aui_thread-viewport"
        data-testid="thread-viewport"
        className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth"
      >
        <div className={cn("mx-auto flex min-h-full w-full max-w-(--thread-max-width) flex-1 flex-col px-1 pt-3", isEmpty && "justify-center")}>
          <AuiIf condition={() => isEmpty}>
            <Welcome />
          </AuiIf>
          <div data-slot="aui_message-group" className="mb-10 flex flex-col gap-y-4 empty:hidden">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === "user") {
                  return message.composer.isEditing ? <UserEditComposer /> : <UserMessage />;
                }
                return <AssistantMessage />;
              }}
            </ThreadPrimitive.Messages>
          </div>
          <ThreadPrimitive.ViewportFooter className={cn("aui-thread-viewport-footer mt-auto flex flex-col gap-3 bg-background pb-2", !isEmpty && "sticky bottom-0 rounded-t-xl pt-2")}>
            <ThreadPrimitive.ScrollToBottom asChild>
              <TooltipIconButton
                tooltip="Scroll to bottom"
                aria-label="Scroll to bottom"
                variant="outline"
                className="absolute -top-10 self-center rounded-full disabled:invisible"
              >
                <ArrowDownIcon className="size-4" />
              </TooltipIconButton>
            </ThreadPrimitive.ScrollToBottom>
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

function useContextualThreadEmpty(): boolean {
  return useAuiState((state) => state.thread.messages.length === 0);
}

const ThreadWelcome: FC = () => (
  <div className="aui-thread-welcome-root mb-5 flex flex-col items-center px-3 text-center">
    <div className="mb-3 grid size-10 place-items-center rounded-xl border border-border bg-muted text-primary">⌘</div>
    <h2 className="text-base font-semibold tracking-tight">可以开始了</h2>
    <p className="mt-1 max-w-[270px] text-xs leading-relaxed text-muted-foreground">
      告诉 Agent 要完成什么，它可以通过通用工具调用 Chrome API 或 CDP。
    </p>
  </div>
);

function useComposerKeyDown() {
  const aui = useAui();

  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${textarea.value.slice(0, start)}\n${textarea.value.slice(end)}`;
    aui.composer.setText(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1;
    });
  };
}

const Composer: FC = () => {
  const handleKeyDown = useComposerKeyDown();

  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <div data-slot="aui_composer-shell" className="border-border/70 focus-within:border-ring flex w-full flex-col gap-2 rounded-xl border bg-muted/30 p-2 shadow-sm transition-colors">
        <ComposerPrimitive.Input
          data-testid="composer-input"
          placeholder="描述要执行的浏览器任务…"
          className="aui-composer-input min-h-12 max-h-32 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          rows={2}
          autoFocus
          enterKeyHint="send"
          submitMode="enter"
          aria-label="Message input"
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-end gap-1.5">
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton tooltip="Send message" aria-label="Send message" variant="default" className="aui-composer-send size-8 rounded-full">
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel asChild>
              <TooltipIconButton tooltip="Stop generating" aria-label="Stop generating" variant="default" className="aui-composer-cancel size-8 rounded-full">
                <SquareIcon className="size-3.5 fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const UserEditComposer: FC = () => {
  const handleKeyDown = useComposerKeyDown();

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-edit-message-root"
      data-role="user"
      className="user-edit-message ml-auto max-w-[94%] text-sm leading-relaxed"
    >
      <ComposerPrimitive.Root data-testid="user-edit-composer" className="user-edit-composer">
        <ComposerPrimitive.Input
          data-testid="user-edit-input"
          placeholder="编辑消息…"
          className="user-edit-input"
          rows={2}
          autoFocus
          enterKeyHint="send"
          submitMode="enter"
          aria-label="编辑消息"
          onKeyDown={handleKeyDown}
        />
        <div className="user-edit-actions">
          <ComposerPrimitive.Cancel asChild>
            <TooltipIconButton tooltip="取消编辑" aria-label="取消编辑" variant="outline">
              <XIcon className="size-3.5" aria-hidden="true" />
            </TooltipIconButton>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton tooltip="提交编辑" aria-label="提交编辑" variant="default">
              <ArrowUpIcon className="size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = ToolFallback,
    ToolGroup: ToolGroupComponent = ToolGroup,
    ReasoningGroup: ReasoningGroupComponent = ReasoningGroup,
  } = useContext(ThreadComponentsContext);

  return (
    <MessagePrimitive.Root data-slot="aui_assistant-message-root" data-role="assistant" className="assistant-message relative min-w-0 px-2 pb-2 text-sm leading-relaxed">
      <div data-slot="aui_assistant-message-content" className="text-foreground wrap-break-word">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning,
            tools: { Override: ToolFallbackComponent },
            ToolGroup: ToolGroupComponent,
            ReasoningGroup: ReasoningGroupComponent,
          }}
        />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive-foreground">
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root data-slot="aui_user-message-root" data-role="user" className="message user ml-auto max-w-[94%] rounded-xl border border-primary/40 bg-primary/15 px-3 py-2 text-sm leading-relaxed wrap-break-word">
    <div className="user-message-content">
      <MessagePrimitive.Parts />
    </div>
    <ActionBarPrimitive.Root className="user-message-actions">
      <ActionBarPrimitive.Edit
        data-testid="edit-message-button"
        className="user-message-edit-button"
        aria-label="编辑消息"
        title="编辑消息"
      >
        <PencilIcon className="size-3.5" aria-hidden="true" />
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  </MessagePrimitive.Root>
);

export default Thread;
