"use client";

import {
  ComposerPrimitive,
  useAui,
  useAuiState,
  type AssistantState,
} from "@assistant-ui/react";
import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { TooltipIconButton } from "./tooltip-icon-button";

const MIN_TEXTAREA_HEIGHT = 48;
const MAX_TEXTAREA_HEIGHT = 128;

const selectComposerText = (state: AssistantState) => state.composer.text;
const selectThreadRunning = (state: AssistantState) => state.thread.isRunning;
const selectQueueEnabled = (state: AssistantState) => state.thread.capabilities.queue;
const selectComposerDisabled = (state: AssistantState) =>
  state.thread.isDisabled || Boolean(state.composer.dictation?.inputDisabled);

type LocalComposerProps = {
  mode: "thread" | "edit";
  rootTestId?: string;
  inputTestId: string;
  placeholder: string;
  inputClassName: string;
  rootClassName: string;
  shellClassName?: string;
};

export const LocalComposer: FC<LocalComposerProps> = ({
  mode,
  rootTestId,
  inputTestId,
  placeholder,
  inputClassName,
  rootClassName,
  shellClassName,
}) => {
  const aui = useAui();
  const externalText = useAuiState(selectComposerText);
  const isRunning = useAuiState(selectThreadRunning);
  const queueEnabled = useAuiState(selectQueueEnabled);
  const isDisabled = useAuiState(selectComposerDisabled);
  // ponytail: the textarea's DOM value is the single draft store; React only
  // mirrors a hasText flag for the send button. If external writers besides
  // send-clear ever appear, switch back to a controlled draft.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const [hasText, setHasText] = useState(() => externalText.trim().length > 0);

  const scheduleResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const input = inputRef.current;
      if (!input) return;

      input.style.height = "auto";
      const height = Math.min(Math.max(input.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
      input.style.height = `${height}px`;
      input.style.overflowY = input.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
    });
  }, []);

  // External text changes (e.g. composer cleared after send) are the only
  // writer besides the user typing.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || input.value === externalText) return;
    input.value = externalText;
    setHasText(Boolean(externalText.trim()));
    scheduleResize();
  }, [externalText, scheduleResize]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const setDraft = useCallback((value: string) => {
    const input = inputRef.current;
    if (!input) return;
    input.value = value;
    setHasText(Boolean(value.trim()));
    scheduleResize();
  }, [scheduleResize]);

  const submitDraft = useCallback(() => {
    const value = inputRef.current?.value ?? "";
    const blockedByRun = mode === "thread" && isRunning && !queueEnabled;
    if (!value.trim() || isDisabled || blockedByRun) return;

    aui.composer.setText(value);
    aui.composer.send();
    setDraft("");
  }, [aui, isDisabled, isRunning, mode, queueEnabled, setDraft]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraft();
  }, [submitDraft]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || composingRef.current) return;
    if (event.shiftKey) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.metaKey || event.ctrlKey) {
      const input = event.currentTarget;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText("\n", start, end, "end");
      setHasText(Boolean(input.value.trim()));
      scheduleResize();
      return;
    }

    submitDraft();
  }, [scheduleResize, submitDraft]);

  const canSend = hasText && !isDisabled && !(mode === "thread" && isRunning && !queueEnabled);

  return (
    <ComposerPrimitive.Root
      data-testid={rootTestId}
      className={rootClassName}
      onSubmit={handleSubmit}
    >
      <div className={shellClassName}>
        <textarea
          ref={inputRef}
          data-testid={inputTestId}
          defaultValue={externalText}
          placeholder={placeholder}
          className={inputClassName}
          rows={2}
          disabled={isDisabled}
          autoFocus
          enterKeyHint="send"
          aria-label={mode === "edit" ? "编辑消息" : "Message input"}
          onChange={(event) => {
            setHasText(Boolean(event.target.value.trim()));
            scheduleResize();
          }}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
        />
        {mode === "thread" ? (
          <div className="flex items-center justify-end gap-1.5">
            {isRunning ? (
              <ComposerPrimitive.Cancel asChild>
                <TooltipIconButton
                  tooltip="Stop generating"
                  aria-label="Stop generating"
                  variant="default"
                  className="aui-composer-cancel size-8 rounded-full"
                >
                  <SquareIcon className="size-3.5 fill-current" />
                </TooltipIconButton>
              </ComposerPrimitive.Cancel>
            ) : (
              <TooltipIconButton
                tooltip="Send message"
                aria-label="Send message"
                variant="default"
                className="aui-composer-send size-8 rounded-full"
                disabled={!canSend}
                onClick={submitDraft}
              >
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            )}
          </div>
        ) : (
          <div className="user-edit-actions">
            <ComposerPrimitive.Cancel asChild>
              <TooltipIconButton tooltip="取消编辑" aria-label="取消编辑" variant="outline">
                <XIcon className="size-3.5" aria-hidden="true" />
              </TooltipIconButton>
            </ComposerPrimitive.Cancel>
            <TooltipIconButton
              tooltip="提交编辑"
              aria-label="提交编辑"
              variant="default"
              disabled={!canSend}
              onClick={submitDraft}
            >
              <ArrowUpIcon className="size-4" />
            </TooltipIconButton>
          </div>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
};
