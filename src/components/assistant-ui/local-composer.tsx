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
import { insertNewlineAtSelection } from "./composer-utils";
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
  const [draft, setDraft] = useState(externalText);
  const draftRef = useRef(externalText);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);

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

  useEffect(() => {
    draftRef.current = externalText;
    setDraft(externalText);
    scheduleResize();
  }, [externalText, scheduleResize]);

  useEffect(() => {
    scheduleResize();
  }, [draft, scheduleResize]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const setLocalDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraft(value);
    scheduleResize();
  }, [scheduleResize]);

  const submitDraft = useCallback(() => {
    const value = inputRef.current?.value ?? draftRef.current;
    const blockedByRun = mode === "thread" && isRunning && !queueEnabled;
    if (!value.trim() || isDisabled || blockedByRun) return;

    aui.composer.setText(value);
    aui.composer.send();
  }, [aui, isDisabled, isRunning, mode, queueEnabled]);

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
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const next = insertNewlineAtSelection(input.value, start, end);
      setLocalDraft(next);
      requestAnimationFrame(() => {
        if (inputRef.current !== input) return;
        input.selectionStart = start + 1;
        input.selectionEnd = start + 1;
      });
      return;
    }

    submitDraft();
  }, [setLocalDraft, submitDraft]);

  const canSend = draft.trim().length > 0 && !isDisabled && !(mode === "thread" && isRunning && !queueEnabled);

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
          value={draft}
          placeholder={placeholder}
          className={inputClassName}
          rows={2}
          disabled={isDisabled}
          autoFocus
          enterKeyHint="send"
          aria-label={mode === "edit" ? "编辑消息" : "Message input"}
          onChange={(event) => setLocalDraft(event.target.value)}
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
