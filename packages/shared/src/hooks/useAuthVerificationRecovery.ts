import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useCallback, useContext, useEffect } from 'react';
import type { ErrorData, InitializationData } from '../lib/kratos';
import { AuthFlow, getKratosFlow, KRATOS_ERROR } from '../lib/kratos';
import { useToastNotification } from './useToastNotification';
import { disabledRefetch } from '../lib/func';
import AuthContext from '../contexts/AuthContext';
import { AuthTriggers } from '../lib/auth';
import { stripLinkParameters } from '../lib/links';

export function useAuthVerificationRecovery(): void {
  const router = useRouter();
  const { showLogin } = useContext(AuthContext);
  const couldBeVerified = !!router?.query.flow && !router?.query.recovery;
  const { displayToast } = useToastNotification();

  const displayErrorMessage = useCallback(
    (text: string) => {
      const link = stripLinkParameters(window.location.href);
      router.replace(link);
      setTimeout(() => displayToast(text), 100);
    },
    [displayToast, router],
  );

  const checkErrorMessage = useCallback(
    (data: InitializationData, flow?: AuthFlow) => {
      if ('error' in data) {
        const errorData = data as unknown as ErrorData;
        displayErrorMessage(errorData.error.message);
        return;
      }

      const hasVerified =
        data?.state === 'passed_challenge' && flow === AuthFlow.Verification;
      if (couldBeVerified && hasVerified) {
        showLogin({ trigger: AuthTriggers.Verification });
        return;
      }

      if (!data?.ui?.messages?.length) {
        return;
      }

      const error =
        data.ui.messages.find(
          (message) => message.id === KRATOS_ERROR.INVALID_TOKEN,
        ) || data.ui.messages[0];
      displayErrorMessage(error.text);
    },
    [couldBeVerified, displayErrorMessage, showLogin],
  );

  const { data: recovery } = useQuery({
    queryKey: [{ type: 'recovery', flow: router?.query.flow as string }],
    queryFn: ({ queryKey: [{ flow }] }) =>
      getKratosFlow(AuthFlow.Recovery, flow),
    enabled: !!router?.query.recovery && !!router?.query.flow,
  });

  const { data: verification } = useQuery({
    queryKey: [{ type: 'verification', flow: router?.query.flow as string }],
    queryFn: ({ queryKey: [{ flow }] }) =>
      getKratosFlow(AuthFlow.Verification, flow),
    ...disabledRefetch,
    enabled: !!router?.query.flow && !router?.query.recovery,
  });

  useEffect(() => {
    if (!recovery && !verification) {
      return;
    }

    if (recovery) {
      checkErrorMessage(recovery);
    }

    if (verification) {
      checkErrorMessage(verification, AuthFlow.Verification);
    }
  }, [checkErrorMessage, recovery, verification]);
}
