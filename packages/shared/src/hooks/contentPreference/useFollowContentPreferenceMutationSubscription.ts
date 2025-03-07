import type { InfiniteData } from '@tanstack/react-query';
import type { Connection } from '../../graphql/common';
import type { ContentPreference } from '../../graphql/contentPreference';
import { RequestKey } from '../../lib/query';
import type { PropsParameters } from '../../types';
import { useMutationSubscription } from '../mutationSubscription';
import type { ContentPreferenceMutation } from './types';
import {
  contentPreferenceMutationMatcher,
  mutationKeyToContentPreferenceStatusMap,
} from './types';

type UseFollowContentPreferenceMutationSubscriptionProps = {
  queryKey: unknown[];
};

type UseFollowContentPreferenceMutationSubscription = ReturnType<
  typeof useMutationSubscription
>;

export const useFollowContentPreferenceMutationSubscription = ({
  queryKey,
}: UseFollowContentPreferenceMutationSubscriptionProps): UseFollowContentPreferenceMutationSubscription => {
  return useMutationSubscription({
    matcher: contentPreferenceMutationMatcher,
    callback: ({
      mutation,
      variables: mutationVariables,
      queryClient: mutationQueryClient,
    }) => {
      const currentData = mutationQueryClient.getQueryData(queryKey);
      const [requestKey] = mutation.options.mutationKey as [
        RequestKey,
        ...unknown[],
      ];

      if (!currentData) {
        return;
      }

      const nextStatus = mutationKeyToContentPreferenceStatusMap[requestKey];

      const { id: entityId, entity } =
        mutationVariables as PropsParameters<ContentPreferenceMutation>;

      const queryType = queryKey[2] as RequestKey;

      mutationQueryClient.setQueryData<
        InfiniteData<Connection<ContentPreference>>
      >(queryKey, (data) => {
        const newData = {
          ...data,
          pages: data.pages?.map((page) => {
            return {
              ...page,
              edges: page.edges?.map((edge) => {
                if (edge.node.type === entity) {
                  const newContentPreferenceEdge = structuredClone(edge);
                  const { node } = newContentPreferenceEdge;

                  const followingKeys = [
                    RequestKey.UserFollowing,
                    RequestKey.UserBlocked,
                  ];
                  if (
                    followingKeys.includes(queryType) &&
                    node.referenceUser?.id === entityId
                  ) {
                    node.referenceUser.contentPreference = {
                      status: nextStatus,
                    };
                  }

                  if (
                    queryType === RequestKey.UserFollowers &&
                    node.user?.id === entityId
                  ) {
                    node.user.contentPreference = {
                      status: nextStatus,
                    };
                  }

                  if (node.referenceId === entityId) {
                    node.status = nextStatus;
                  }

                  return newContentPreferenceEdge;
                }

                return edge;
              }),
            };
          }),
        };

        return newData;
      });
    },
  });
};
