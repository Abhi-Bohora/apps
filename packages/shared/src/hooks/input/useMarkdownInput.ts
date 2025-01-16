import type {
  ClipboardEventHandler,
  DragEventHandler,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  MutableRefObject,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GetReplacementFn } from '../../lib/textarea';
import {
  CursorType,
  getCloseWord,
  getCursorType,
  getTemporaryUploadString,
  TextareaCommand,
} from '../../lib/textarea';
import { useRequestProtocol } from '../useRequestProtocol';
import { useAuthContext } from '../../contexts/AuthContext';
import type { RecommendedMentionsData } from '../../graphql/comments';
import { RECOMMEND_MENTIONS_QUERY } from '../../graphql/comments';
import { isNullOrUndefined } from '../../lib/func';
import {
  ArrowKey,
  arrowKeys,
  getCaretOffset,
  KeyboardCommand,
  Y_AXIS_KEYS,
} from '../../lib/element';
import type { UserShortProfile } from '../../lib/user';
import { getLinkReplacement, getMentionReplacement } from '../../lib/markdown';
import { handleRegex } from '../../graphql/users';
import { UploadState, useSyncUploader } from './useSyncUploader';
import { useToastNotification } from '../useToastNotification';
import {
  allowedContentImage,
  allowedFileSize,
  uploadNotAcceptedMessage,
} from '../../graphql/posts';
import { isValidHttpUrl } from '../../lib';

export enum MarkdownCommand {
  Upload = 'upload',
  Link = 'link',
  Mention = 'mention',
}

export interface UseMarkdownInputProps
  extends Pick<HTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> {
  textareaRef: MutableRefObject<HTMLTextAreaElement>;
  postId?: string;
  sourceId?: string;
  initialContent?: string;
  onValueUpdate?: (value: string) => void;
  enabledCommand?: Partial<Record<MarkdownCommand, boolean>>;
}

type InputCallbacks = Pick<
  HTMLAttributes<HTMLTextAreaElement>,
  'onSubmit' | 'onKeyDown' | 'onKeyUp' | 'onDrop' | 'onInput' | 'onPaste'
>;

export interface UseMarkdownInput {
  input: string;
  query?: string;
  offset?: number[];
  selected?: number;
  onLinkCommand?: () => Promise<unknown>;
  onMentionCommand?: () => Promise<void>;
  onUploadCommand?: (files: FileList) => void;
  onApplyMention?: (username: string) => Promise<void>;
  checkMention?: (position?: number[]) => void;
  onCloseMention?: () => void;
  mentions?: UserShortProfile[];
  callbacks: InputCallbacks;
  uploadingCount: number;
  uploadedCount: number;
}

export const defaultMarkdownCommands = {
  link: true,
  mention: true,
};

export const useMarkdownInput = ({
  textareaRef,
  postId,
  sourceId,
  onSubmit,
  onValueUpdate,
  initialContent = '',
  enabledCommand = {},
}: UseMarkdownInputProps): UseMarkdownInput => {
  const dirtyRef = useRef(false);
  const textarea = textareaRef?.current;
  const isLinkEnabled = enabledCommand[MarkdownCommand.Link];
  const isUploadEnabled = enabledCommand[MarkdownCommand.Upload];
  const isMentionEnabled = enabledCommand[MarkdownCommand.Mention];
  const [command, setCommand] = useState<TextareaCommand>();
  const [input, setInput] = useState(initialContent);
  const [query, setQuery] = useState<string>(undefined);
  const [offset, setOffset] = useState([0, 0]);
  const [selected, setSelected] = useState(0);
  const { requestMethod } = useRequestProtocol();
  const key = ['user', query, postId, sourceId];
  const { user } = useAuthContext();
  const { displayToast } = useToastNotification();

  const getTextBoundaries = (
    text: string,
    selectionStart: number,
    selectionEnd: number,
  ) => {
    const selectedText = text.substring(selectionStart, selectionEnd);
    const trimmedText = selectedText.trim();
    const leadingWhitespace =
      selectedText.length - selectedText.trimStart().length;
    const trailingWhitespace =
      selectedText.length - selectedText.trimEnd().length;
    return {
      trimmedText,
      newStart: selectionStart + leadingWhitespace,
      newEnd: selectionEnd - trailingWhitespace,
    };
  };

  useEffect(() => {
    if (dirtyRef.current) {
      return;
    }

    if (input?.length === 0 && initialContent?.length > 0) {
      setInput(initialContent);
    }
  }, [input, initialContent]);

  const onUpdate = (value: string) => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
    }

    setInput(value);
    if (onValueUpdate) {
      onValueUpdate(value);
    }
  };

  const { uploadedCount, queueCount, pushUpload, startUploading } =
    useSyncUploader({
      onStarted: async (file) => {
        const temporary = getTemporaryUploadString(file.name);
        const replace: GetReplacementFn = (_, { trailingChar }) => ({
          replacement: `${!trailingChar ? '' : '\n\n'}${temporary}\n\n`,
        });
        const type = getCursorType(textarea);
        const allowedType =
          type === CursorType.Adjacent ? CursorType.Isolated : type;
        await command.replaceWord(replace, onUpdate, allowedType);
      },
      onFinish: async (status, file, url) => {
        if (status === UploadState.Failed) {
          return displayToast(uploadNotAcceptedMessage);
        }

        return onUpdate(command.onReplaceUpload(url, file.name));
      },
    });

  useEffect(() => {
    if (!textareaRef?.current) {
      return;
    }

    setCommand(new TextareaCommand(textareaRef));
  }, [setCommand, textareaRef]);

  const { data = { recommendedMentions: [] } } =
    useQuery<RecommendedMentionsData>({
      queryKey: key,
      queryFn: () =>
        requestMethod(
          RECOMMEND_MENTIONS_QUERY,
          { postId, query, sourceId },
          { requestKey: JSON.stringify(key) },
        ),

      enabled: !!user && typeof query !== 'undefined',
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const mentions = data?.recommendedMentions;

  const updateQuery = (value: string) => {
    if (!isMentionEnabled || value === query) {
      return;
    }

    if (isNullOrUndefined(query) && !isNullOrUndefined(value)) {
      setOffset(getCaretOffset(textarea));
    }

    setQuery(value);
  };

  const onApplyMention = async (username: string) => {
    const getReplacement = () => ({ replacement: `@${username} ` });
    await command.replaceWord(getReplacement, onUpdate, CursorType.Adjacent);
    updateQuery(undefined);
  };

  const onLinkCommand = () => command.replaceWord(getLinkReplacement, onUpdate);

  const onMentionCommand = async () => {
    const { replacement } = await command.replaceWord(
      getMentionReplacement,
      onUpdate,
    );
    const mention = replacement.trim().substring(1);
    updateQuery(mention);
  };

  const checkMention = (position?: number[]) => {
    const current = [textarea.selectionStart, textarea.selectionEnd];
    const selection = position ?? current;
    const [word] = getCloseWord(textarea, selection);
    const mention = word.substring(1);
    const isValid =
      word.charAt(0) === '@' &&
      (mention.length === 0 || handleRegex.test(mention));

    if (!isValid) {
      return updateQuery(undefined);
    }

    if (isNullOrUndefined(query)) {
      return updateQuery(mention ?? '');
    }

    return updateQuery(mention);
  };

  const onKeyUp: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    const pressed = e.key as ArrowKey;

    if (!arrowKeys.includes(pressed)) {
      return;
    }

    if (Y_AXIS_KEYS.includes(pressed) && mentions?.length) {
      return;
    }

    const { selectionStart, selectionEnd } = e.currentTarget;
    checkMention([selectionStart, selectionEnd]);
  };

  const handleTextFormatting = (
    value: string,
    symbol: string,
    start: number,
    end: number,
  ) => {
    const { trimmedText, newStart, newEnd } = getTextBoundaries(
      value,
      start,
      end,
    );
    const symbolLength = symbol.length;
    const isFormatted =
      value.substring(newStart - symbolLength, newStart) === symbol &&
      value.substring(newEnd, newEnd + symbolLength) === symbol;

    if (isFormatted) {
      const updatedValue =
        value.substring(0, newStart - symbolLength) +
        trimmedText +
        value.substring(newEnd + symbolLength);
      return {
        value: updatedValue,
        selection: [newStart - symbolLength, newEnd - symbolLength] as const,
      };
    }

    const updatedValue =
      value.substring(0, newStart) +
      symbol +
      trimmedText +
      symbol +
      value.substring(newEnd);
    return {
      value: updatedValue,
      selection: [newStart + symbolLength, newEnd + symbolLength] as const,
    };
  };

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = async (e) => {
    const isSpecialKey = e.ctrlKey || e.metaKey;
    const textareaLocal = textareaRef.current;

    if (isSpecialKey) {
      switch (e.key) {
        case 'b': {
          e.preventDefault();
          const boldResult = handleTextFormatting(
            textareaLocal.value,
            '**',
            textareaLocal.selectionStart,
            textareaLocal.selectionEnd,
          );
          onUpdate(boldResult.value);
          requestAnimationFrame(() => {
            textareaLocal.setSelectionRange(...boldResult.selection);
          });
          return;
        }
        case 'i': {
          e.preventDefault();
          const italicResult = handleTextFormatting(
            textareaLocal.value,
            '_',
            textareaLocal.selectionStart,
            textareaLocal.selectionEnd,
          );
          onUpdate(italicResult.value);
          requestAnimationFrame(() => {
            textareaLocal.setSelectionRange(...italicResult.selection);
          });
          return;
        }
        case 'k': {
          e.preventDefault();
          e.stopPropagation();
          onLinkCommand?.();
          return;
        }
        default:
          break;
      }
    }

    const isSubmitting =
      isSpecialKey && e.key === KeyboardCommand.Enter && input?.length;

    if (onSubmit && isSubmitting) {
      return onSubmit(e);
    }

    const isNavigatingPopup =
      e.key === KeyboardCommand.Enter ||
      Y_AXIS_KEYS.includes(e.key as ArrowKey);

    if (!isNavigatingPopup || !mentions?.length) {
      return e.stopPropagation(); // to stop app navigation
    }

    e.preventDefault();

    const arrowKey = e.key as ArrowKey;

    if (Y_AXIS_KEYS.includes(e.key as ArrowKey)) {
      if (arrowKey === ArrowKey.Up) {
        if (selected > 0) {
          setSelected(selected - 1);
        }
      } else if (selected < mentions.length - 1) {
        setSelected(selected + 1);
      }
    }

    const mention = mentions[selected];
    if (mention && e.key === KeyboardCommand.Enter) {
      await onApplyMention(mention.username);
    }

    return null;
  };

  const onInput: FormEventHandler<HTMLTextAreaElement> = (e) => {
    const target = e.currentTarget;

    if (!target) {
      return;
    }

    onUpdate(target.value);
    checkMention();
  };

  const verifyFile = (file: File) => {
    const isValidType = allowedContentImage.includes(file.type);

    if (file.size > allowedFileSize || !isValidType) {
      displayToast(uploadNotAcceptedMessage);
      return;
    }

    pushUpload(file);
  };

  const onDrop: DragEventHandler<HTMLTextAreaElement> = async (e) => {
    e.preventDefault();
    const items = e.dataTransfer.files;

    if (!items.length || !isUploadEnabled) {
      return;
    }

    Array.from(items).forEach(verifyFile);

    startUploading();
  };

  const onUploadCommand = (files: FileList) => {
    Array.from(files).forEach(verifyFile);

    startUploading();
  };

  const onPaste: ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!e.clipboardData.files?.length && !isUploadEnabled) {
      return;
    }

    const textareaLocal = e.currentTarget;
    const pastedText = e.clipboardData.getData('text');
    if (
      isValidHttpUrl(pastedText) &&
      textareaLocal.selectionStart !== textareaLocal.selectionEnd
    ) {
      e.preventDefault();
      const { trimmedText, newStart, newEnd } = getTextBoundaries(
        textareaLocal.value,
        textareaLocal.selectionStart,
        textareaLocal.selectionEnd,
      );
      const newText =
        isValidHttpUrl(pastedText) && trimmedText
          ? `${textareaLocal.value.substring(
              0,
              newStart,
            )}[${trimmedText}](${pastedText})${textareaLocal.value.substring(
              newEnd,
            )}`
          : textareaLocal.value.substring(0, textareaLocal.selectionStart) +
            pastedText +
            textareaLocal.value.substring(textareaLocal.selectionEnd);
      const linkEnd = newStart + `[${trimmedText}](${pastedText})`.length;
      onUpdate(newText);
      requestAnimationFrame(() => {
        textareaLocal.setSelectionRange(linkEnd, linkEnd);
      });
      return;
    }
    if (e.clipboardData.files?.length && isUploadEnabled) {
      e.preventDefault();

      Array.from(e.clipboardData.files).forEach(verifyFile);

      startUploading();
    }
  };

  const onCloseMention = useCallback(() => setQuery(undefined), []);
  const uploadCommands = isUploadEnabled ? { onDrop, onPaste } : {};
  const uploadProps = isUploadEnabled
    ? { uploadedCount, uploadingCount: queueCount, onUploadCommand }
    : { uploadedCount: 0, uploadingCount: 0 };

  const queryMentions = useMemo(() => data?.recommendedMentions ?? [], [data]);
  const mentionProps = isMentionEnabled
    ? {
        query,
        offset,
        selected,
        checkMention,
        onCloseMention,
        onMentionCommand,
        onApplyMention,
        mentions: queryMentions,
      }
    : {};

  return {
    ...uploadProps,
    ...mentionProps,
    input,
    onLinkCommand: isLinkEnabled ? onLinkCommand : null,
    callbacks: {
      onInput,
      onKeyUp,
      onKeyDown,
      onPaste,
      ...uploadCommands,
    },
  };
};

export default useMarkdownInput;
