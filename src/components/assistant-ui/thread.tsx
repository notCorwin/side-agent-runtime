"use client";

import {
  AuiIf,
  ActionBarPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  useAuiState,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { ArrowDownIcon, PencilIcon } from "lucide-react";
import { createContext, useContext, type ComponentType, type FC } from "react";
import { LocalComposer } from "./local-composer";
import { MarkdownText } from "./markdown-text";
import { Reasoning } from "./reasoning";
import { ToolFallback } from "./tool-fallback";
import { TooltipIconButton } from "./tooltip-icon-button";
import { cn } from "@/lib/utils";

export type ThreadComponents = {
  Welcome?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
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
        <div className={cn("aui-thread-content mx-auto flex w-full max-w-(--thread-max-width) flex-col px-1", !isEmpty && "pt-3")}>
          <AuiIf condition={() => isEmpty}>
            <div className="aui-thread-welcome flex flex-1 items-center justify-center">
              <Welcome />
            </div>
          </AuiIf>
          <div data-slot="aui_message-group" className={cn("mb-10 flex flex-col gap-y-4 empty:hidden", isEmpty && "hidden")}>
            <ThreadPrimitive.Messages components={THREAD_MESSAGE_COMPONENTS} />
          </div>
        </div>
        <ThreadPrimitive.ViewportFooter className={cn("aui-thread-viewport-footer mt-auto flex flex-col gap-3 bg-background px-1 pb-2", !isEmpty && "sticky bottom-0 rounded-t-xl pt-2")}>
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
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

function useContextualThreadEmpty(): boolean {
  return useAuiState((state) => state.thread.messages.length === 0);
}

const ThreadWelcome: FC = () => (
  <div className="aui-thread-welcome-root" data-testid="welcome-options">
    <ThreadPrimitive.Suggestions>
      {() => (
        <SuggestionPrimitive.Trigger send className="welcome-option">
          <SuggestionPrimitive.Title />
        </SuggestionPrimitive.Trigger>
      )}
    </ThreadPrimitive.Suggestions>
  </div>
);

const Composer: FC = () => (
  <LocalComposer
    mode="thread"
    inputTestId="composer-input"
    placeholder="描述要执行的浏览器任务…"
    inputClassName="aui-composer-input min-h-12 max-h-32 w-full resize-none overflow-y-hidden bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
    rootClassName="aui-composer-root relative flex w-full flex-col"
    shellClassName="border-border/70 focus-within:border-ring flex w-full flex-col gap-2 rounded-xl border bg-muted/30 p-2 shadow-sm transition-colors"
  />
);

const UserEditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-edit-message-root"
      data-role="user"
      className="user-edit-message ml-auto max-w-[94%] text-sm leading-relaxed"
    >
      <LocalComposer
        mode="edit"
        rootTestId="user-edit-composer"
        inputTestId="user-edit-input"
        placeholder="编辑消息…"
        inputClassName="user-edit-input"
        rootClassName="user-edit-composer"
      />
    </MessagePrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  const { ToolFallback: ToolFallbackComponent = ToolFallback } = useContext(ThreadComponentsContext);

  return (
    <MessagePrimitive.Root data-slot="aui_assistant-message-root" data-role="assistant" className="assistant-message relative min-w-0 px-2 pb-2 text-sm leading-relaxed">
      <div data-slot="aui_assistant-message-content" className="assistant-message-content text-foreground wrap-break-word">
        <MessagePrimitive.Parts>
          {({ part }) => {
            switch (part.type) {
              case "text":
                return <MarkdownText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallbackComponent {...part} />;
              default:
                return null;
            }
          }}
        </MessagePrimitive.Parts>
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
  <MessagePrimitive.Root data-slot="aui_user-message-root" data-role="user" className="user-message-row ml-auto text-sm leading-relaxed">
    <div className="message user user-message-bubble max-w-full rounded-xl border border-primary/40 bg-primary/15 px-3 py-2 wrap-break-word">
      <div className="user-message-content">
        <MessagePrimitive.Parts />
      </div>
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

const THREAD_MESSAGE_COMPONENTS = {
  UserMessage,
  UserEditComposer,
  AssistantMessage,
};

export default Thread;
