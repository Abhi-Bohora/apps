import classNames from 'classnames';
import type { MutableRefObject, ReactElement } from 'react';
import React, { useEffect, useId, useRef, useState } from 'react';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/router';
import type {
  AuthTriggersType,
  RegistrationError,
  RegistrationParameters,
} from '../../lib/auth';
import { AuthEventNames, AuthTriggers } from '../../lib/auth';
import { formToJson } from '../../lib/form';
import { Button, ButtonVariant, ButtonSize } from '../buttons/Button';
import { PasswordField } from '../fields/PasswordField';
import { TextField } from '../fields/TextField';
import {
  MailIcon,
  UserIcon,
  VIcon,
  AtIcon,
  TwitterIcon,
  ArrowIcon,
} from '../icons';
import type { CloseModalFunc } from '../modals/common';
import AuthHeader from './AuthHeader';
import TokenInput from './TokenField';
import AuthForm from './AuthForm';
import { Checkbox } from '../fields/Checkbox';
import { useLogContext } from '../../contexts/LogContext';
import { useGenerateUsername, useCheckExistingEmail } from '../../hooks';
import type { AuthFormProps } from './common';
import ConditionalWrapper from '../ConditionalWrapper';
import AuthContainer from './AuthContainer';
import { onValidateHandles } from '../../hooks/useProfileForm';
import ExperienceLevelDropdown from '../profile/ExperienceLevelDropdown';
import Alert, { AlertType, AlertParagraph } from '../widgets/Alert';
import { isDevelopment } from '../../lib/constants';
import { useFeature } from '../GrowthBookProvider';
import { featureOnboardingReorder } from '../../lib/featureManagement';
import {
  Typography,
  TypographyTag,
  TypographyType,
} from '../typography/Typography';
import { onboardingGradientClasses } from '../onboarding/common';
import { useAuthData } from '../../contexts/AuthDataContext';

export interface RegistrationFormProps extends AuthFormProps {
  formRef?: MutableRefObject<HTMLFormElement>;
  onBack?: CloseModalFunc;
  hints?: RegistrationError;
  onUpdateHints?: (errors: RegistrationError) => void;
  onSignup?: (params: RegistrationFormValues) => void;
  token: string;
  trigger: AuthTriggersType;
  onExistingEmailLoginClick?: () => void;
  onBackToIntro?: () => void;
  targetId?: string;
}

export type RegistrationFormValues = Omit<
  RegistrationParameters,
  'method' | 'provider'
> & {
  headers?: Record<string, string>;
};

const RegistrationForm = ({
  formRef,
  onBack,
  onBackToIntro,
  onExistingEmailLoginClick,
  onSignup,
  token,
  hints,
  trigger,
  onUpdateHints,
  simplified,
  targetId,
}: RegistrationFormProps): ReactElement => {
  const { email } = useAuthData();
  const router = useRouter();
  const { logEvent } = useLogContext();
  const [turnstileError, setTurnstileError] = useState<boolean>(false);
  const [turnstileLoaded, setTurnstileLoaded] = useState<boolean>(false);
  const [turnstileErrorLoading, setTurnstileErrorLoading] =
    useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [name, setName] = useState('');
  const isAuthorOnboarding = trigger === AuthTriggers.Author;
  const { username, setUsername } = useGenerateUsername(name);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const isReorderExperiment = useFeature(featureOnboardingReorder);
  const isOnboardingExperiment = !!(
    router.pathname?.startsWith('/onboarding') && isReorderExperiment
  );

  const logRef = useRef<typeof logEvent>();
  logRef.current = logEvent;

  useEffect(() => {
    logRef.current({
      event_name: AuthEventNames.StartSignUpForm,
    });
  }, []);

  useEffect(() => {
    if (Object.keys(hints).length) {
      logRef.current({
        event_name: AuthEventNames.SubmitSignUpFormError,
        extra: JSON.stringify({ error: hints }),
      });
      if (hints?.csrf_token) {
        setTurnstileError(true);
      }
      turnstileRef?.current?.reset();
    }
  }, [hints]);

  useEffect(() => {
    if (turnstileLoaded) {
      return () => {};
    }

    const turnstileLoadTimeout = setTimeout(() => {
      if (!turnstileLoaded) {
        logRef.current({
          event_name: AuthEventNames.TurnstileLoadError,
        });
        setTurnstileErrorLoading(true);
      }
    }, 5000);

    return () => clearTimeout(turnstileLoadTimeout);
  }, [turnstileLoaded]);

  const {
    email: { isCheckPending, alreadyExists },
    onEmailCheck,
  } = useCheckExistingEmail({
    onValidEmail: () => null,
    onAfterEmailCheck: (emailExists) => {
      if (emailExists && isOnboardingExperiment) {
        logRef.current({
          event_name: AuthEventNames.OpenLogin,
          extra: JSON.stringify({ trigger }),
          target_id: targetId,
        });
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isOnboardingExperiment && (isCheckPending || alreadyExists)) {
      return;
    }

    setTurnstileError(false);
    logRef.current({
      event_name: AuthEventNames.SubmitSignUpForm,
    });

    setIsSubmitted(true);
    const form = e.target as HTMLFormElement;
    const { optOutMarketing, ...values } = formToJson<RegistrationFormValues>(
      formRef?.current ?? form,
    );
    delete values?.['cf-turnstile-response'];

    if (
      !values['traits.name']?.length ||
      !values['traits.username']?.length ||
      !values['traits.experienceLevel']?.length
    ) {
      const setHints = { ...hints };

      if (!values['traits.name']?.length) {
        setHints['traits.name'] = 'Please provide name.';
      }
      if (!values['traits.username']?.length) {
        setHints['traits.username'] = 'Please provide username.';
      }
      if (!values['traits.experienceLevel']?.length) {
        setHints['traits.experienceLevel'] = 'Please provide experience level.';
      }

      onUpdateHints(setHints);
      return;
    }

    if (!turnstileRef?.current?.getResponse()) {
      logRef.current({
        event_name: AuthEventNames.SubmitSignUpFormError,
        extra: JSON.stringify({
          error: 'Turnstile not valid',
        }),
      });
      setTurnstileError(true);
      return;
    }

    const error = onValidateHandles(
      {},
      {
        username: values['traits.username'],
        twitter: values['traits.twitter'],
      },
    );

    if (error.username || error.twitter) {
      const updatedHints = { ...hints };

      if (error.username) {
        updatedHints['traits.username'] = error.username;
      }

      if (error.twitter) {
        updatedHints['traits.twitter'] = error.twitter;
      }

      onUpdateHints(updatedHints);
      return;
    }

    onSignup({
      ...values,
      'traits.acceptedMarketing': !optOutMarketing,
      headers: {
        'True-Client-Ip': isDevelopment
          ? undefined
          : turnstileRef?.current?.getResponse(),
      },
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    if (!isOnboardingExperiment) {
      onSubmit(e);
      return;
    }

    const emailCheck = await onEmailCheck(e);
    if (!!emailCheck && emailCheck.emailValue && !emailCheck.emailExists) {
      onSubmit(e);
    }
  };

  const isNameValid = !hints?.['traits.name'];
  const isUsernameValid = !hints?.['traits.username'];
  const isExperienceLevelValid =
    !isSubmitted || !hints?.['traits.experienceLevel'];

  const headingId = useId();

  return (
    <>
      {!isOnboardingExperiment ? (
        <AuthHeader
          id={headingId}
          simplified={simplified}
          title="Sign up"
          onBack={onBack}
        />
      ) : (
        <div className="flex gap-4">
          <Button
            className="border-border-subtlest-tertiary text-text-secondary"
            icon={<ArrowIcon className="-rotate-90" />}
            onClick={onBackToIntro}
            size={ButtonSize.Medium}
            variant={ButtonVariant.Secondary}
          />
          <Typography
            className={classNames('mt-0.5 flex-1', onboardingGradientClasses)}
            tag={TypographyTag.H2}
            type={TypographyType.Title1}
          >
            Join daily.dev
          </Typography>
        </div>
      )}
      <AuthForm
        aria-labelledby={!isOnboardingExperiment && headingId}
        className={classNames(
          'w-full flex-1 place-items-center gap-2 self-center overflow-y-auto pb-2',
          isOnboardingExperiment ? 'mt-10' : 'mt-6 px-6 tablet:px-[3.75rem]',
        )}
        data-testid="registration_form"
        id="auth-form"
        onSubmit={handleFormSubmit}
        ref={formRef}
      >
        <TokenInput token={token} />
        <TextField
          autoFocus={!!isOnboardingExperiment}
          autoComplete="email"
          saveHintSpace
          className={{ container: 'w-full' }}
          leftIcon={<MailIcon aria-hidden role="presentation" />}
          name="traits.email"
          inputId="email"
          label="Email"
          type="email"
          value={email}
          readOnly={!isOnboardingExperiment}
          rightIcon={
            <VIcon
              aria-hidden
              role="presentation"
              className="text-accent-avocado-default"
            />
          }
        />
        {isOnboardingExperiment && alreadyExists && (
          <Alert
            className="-mt-4 mb-3 min-w-full"
            type={AlertType.Error}
            flexDirection="flex-row"
          >
            <AlertParagraph className="!mt-0 flex-1">
              Email is taken. Existing user?{' '}
              <button
                type="button"
                onClick={() => onExistingEmailLoginClick?.()}
                className="font-bold underline"
              >
                Log in.
              </button>
            </AlertParagraph>
          </Alert>
        )}
        <TextField
          autoFocus={!isOnboardingExperiment}
          autoComplete="name"
          saveHintSpace
          className={{ container: 'w-full' }}
          valid={isNameValid}
          leftIcon={<UserIcon aria-hidden role="presentation" />}
          name="traits.name"
          inputId="traits.name"
          label="Name"
          hint={hints?.['traits.name']}
          value={name}
          onBlur={(e) => setName(e.target.value)}
          valueChanged={() =>
            hints?.['traits.name'] &&
            onUpdateHints({ ...hints, 'traits.name': '' })
          }
          rightIcon={
            isNameValid && (
              <VIcon
                aria-hidden
                role="presentation"
                className="text-accent-avocado-default"
              />
            )
          }
        />
        <PasswordField
          required
          minLength={6}
          maxLength={72}
          saveHintSpace
          className={{ container: 'w-full' }}
          name="password"
          inputId="password"
          label="Create a password"
          autoComplete="new-password"
        />
        <TextField
          autoComplete="user"
          saveHintSpace
          className={{ container: 'w-full' }}
          valid={isUsernameValid}
          leftIcon={<AtIcon aria-hidden role="presentation" secondary />}
          name="traits.username"
          inputId="traits.username"
          label="Enter a username"
          value={username}
          onBlur={(e) => setUsername(e.target.value)}
          hint={hints?.['traits.username']}
          valueChanged={() =>
            hints?.['traits.username'] &&
            onUpdateHints({ ...hints, 'traits.username': '' })
          }
          rightIcon={
            isUsernameValid && <VIcon className="text-accent-avocado-default" />
          }
        />
        {isAuthorOnboarding && (
          <TextField
            saveHintSpace
            className={{ container: 'w-full' }}
            leftIcon={<TwitterIcon aria-hidden role="presentation" />}
            name="traits.twitter"
            inputId="traits.twitter"
            label="X"
            type="text"
            required
          />
        )}
        <ExperienceLevelDropdown
          className={{ container: 'w-full' }}
          name="traits.experienceLevel"
          valid={isExperienceLevelValid}
          hint={hints?.['traits.experienceLevel']}
          onChange={() =>
            hints?.['traits.experienceLevel'] &&
            onUpdateHints({ ...hints, 'traits.experienceLevel': '' })
          }
          saveHintSpace
        />
        <span className="border-b border-border-subtlest-tertiary pb-4 text-text-secondary typo-subhead">
          Your email will be used to send you product and community updates
        </span>
        <Checkbox name="optOutMarketing">
          I don&apos;t want to receive updates and promotions via email
        </Checkbox>
        <ConditionalWrapper
          condition={simplified}
          wrapper={(component) => (
            <AuthContainer className="!mt-0 border-t border-border-subtlest-tertiary p-3 !px-3 pb-1">
              {component}
            </AuthContainer>
          )}
        >
          <Turnstile
            ref={turnstileRef}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_KEY}
            options={{
              theme: 'dark',
            }}
            className="mx-auto min-h-[4.5rem]"
            onWidgetLoad={() => setTurnstileLoaded(true)}
          />
          {turnstileError && (
            <Alert
              type={AlertType.Error}
              title="Please complete the security check."
            />
          )}
          {turnstileErrorLoading && (
            <Alert
              type={AlertType.Error}
              title="Turnstile is taking too long to load. Please try again."
            />
          )}
          <Button
            className="w-full"
            disabled={isCheckPending || !turnstileLoaded}
            form="auth-form"
            type="submit"
            variant={ButtonVariant.Primary}
          >
            {!isOnboardingExperiment ? 'Sign up' : 'Create account'}
          </Button>
        </ConditionalWrapper>
      </AuthForm>
    </>
  );
};

export default RegistrationForm;
