import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MouseEventHandler } from 'react';
import { useCallback } from 'react';
import type {
  SquadPostRejectionProps,
  SquadPostModerationProps,
  SourcePostModeration,
} from '../../graphql/squads';
import {
  PostModerationReason,
  squadApproveMutation,
  squadRejectMutation,
  deletePendingPostMutation,
} from '../../graphql/squads';
import { useLazyModal } from '../useLazyModal';
import { LazyModal } from '../../components/modals/common/types';
import { usePrompt } from '../usePrompt';
import { useToastNotification } from '../useToastNotification';
import { generateQueryKey, RequestKey } from '../../lib/query';
import { LogEvent } from '../../lib/log';
import { useLogContext } from '../../contexts/LogContext';
import { postLogEvent } from '../../lib/feed';
import type { Post } from '../../graphql/posts';
import { useAuthContext } from '../../contexts/AuthContext';

export const rejectReasons: { value: PostModerationReason; label: string }[] = [
  {
    value: PostModerationReason.OffTopic,
    label: 'Off-topic post unrelated to the Squad',
  },
  {
    value: PostModerationReason.Violation,
    label: "Violates the Squad's code of conduct",
  },
  {
    value: PostModerationReason.Promotional,
    label: 'Too promotional without adding value',
  },
  {
    value: PostModerationReason.Duplicate,
    label: 'Duplicate or similar content already posted',
  },
  { value: PostModerationReason.LowQuality, label: 'Lacks quality or clarity' },
  {
    value: PostModerationReason.NSFW,
    label: 'Inappropriate, NSFW or offensive post',
  },
  { value: PostModerationReason.Spam, label: 'Post is spam or scam' },
  {
    value: PostModerationReason.Misinformation,
    label: 'Contains misleading or false information',
  },
  {
    value: PostModerationReason.Copyright,
    label: 'Copyright or privacy violation',
  },
  { value: PostModerationReason.Other, label: 'Other' },
];

export interface UseSourceModerationList {
  onApprove: (
    ids: string[],
    sourceId?: string,
    onSuccess?: MouseEventHandler,
  ) => Promise<void>;
  onReject: (
    id: string,
    sourceId?: string,
    onSuccess?: MouseEventHandler,
  ) => void;
  onDelete: (postId: string) => Promise<void>;
  isPending: boolean;
  isSuccess: boolean;
}

const getLogPostsFromModerationArray = (data: SourcePostModeration[]) => {
  return data.map<Post>((item) => ({
    id: item.id,
    source: item.source,
    type: item.type,
    image: item.image,
    commentsPermalink: '',
    author: item.createdBy,
    createdAt: item.createdAt,
  }));
};

export const useSourceModerationList = (): UseSourceModerationList => {
  const { openModal, closeModal } = useLazyModal();
  const { displayToast } = useToastNotification();
  const { showPrompt } = usePrompt();
  const { logEvent } = useLogContext();
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const queryKey = generateQueryKey(RequestKey.SquadPostRequests, user);

  const {
    mutateAsync: onApprove,
    isPending: isPendingApprove,
    isSuccess: isSuccessApprove,
  } = useMutation({
    mutationFn: ({ postIds }: SquadPostModerationProps) =>
      squadApproveMutation(postIds),
    onSuccess: (data) => {
      displayToast('Post(s) approved successfully');
      queryClient.invalidateQueries({
        queryKey,
      });
      getLogPostsFromModerationArray(data).forEach((post) => {
        logEvent(postLogEvent(LogEvent.ApprovePost, post));
      });
    },
    onError: (_, variables) => {
      if (variables.postIds.length > 50) {
        displayToast(
          'Failed to approve post(s). Please approve maximum 50 posts at a time',
        );
        return;
      }
      displayToast('Failed to approve post(s)');
    },
  });

  const onApprovePost: UseSourceModerationList['onApprove'] = useCallback(
    async (postIds, sourceId) => {
      if (postIds.length === 1) {
        await onApprove({ postIds, sourceId });
        return;
      }

      const confirmed = await showPrompt({
        title: `Approve all ${postIds.length} posts?`,
        description: 'This action cannot be undone.',
        okButton: {
          title: 'Yes, Approve all',
        },
      });

      if (confirmed) {
        await onApprove({ postIds, sourceId });
      }
    },
    [onApprove, showPrompt],
  );

  const {
    mutateAsync: onReject,
    isPending: isPendingReject,
    isSuccess: isSuccessReject,
  } = useMutation({
    mutationFn: (props: SquadPostRejectionProps) => squadRejectMutation(props),
    onSuccess: (data) => {
      displayToast('Post(s) declined successfully');
      queryClient.invalidateQueries({
        queryKey,
      });
      getLogPostsFromModerationArray(data).forEach((post) => {
        logEvent(postLogEvent(LogEvent.RejectPost, post));
      });
    },
    onError: () => {
      displayToast('Failed to decline post(s)');
    },
  });

  const onRejectPost: UseSourceModerationList['onReject'] = useCallback(
    (postId, sourceId) => {
      openModal({
        type: LazyModal.ReasonSelection,
        props: {
          onReport: (_, reason: PostModerationReason, note) =>
            onReject({
              postIds: [postId],
              sourceId,
              reason,
              note,
            }).then(closeModal),
          reasons: rejectReasons,
          heading: 'Select a reason for declining',
        },
      });
    },
    [closeModal, onReject, openModal],
  );

  const { mutateAsync: onDelete } = useMutation({
    mutationFn: (postId: string) => deletePendingPostMutation(postId),
    onSuccess: () => {
      displayToast('Post deleted successfully');
      queryClient.invalidateQueries({
        queryKey,
      });
    },
    onError: () => {
      displayToast('Failed to delete post');
    },
  });

  return {
    isSuccess: isSuccessApprove || isSuccessReject,
    isPending: isPendingApprove || isPendingReject,
    onApprove: onApprovePost,
    onReject: onRejectPost,
    onDelete,
  };
};
