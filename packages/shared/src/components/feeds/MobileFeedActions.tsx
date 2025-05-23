import type { ReactElement } from 'react';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import Link from '../utilities/Link';
import { ReadingStreakButton } from '../streak/ReadingStreakButton';
import { Divider } from '../utilities';
import { useReadingStreak } from '../../hooks/streaks';
import { ButtonIconPosition, ButtonVariant } from '../buttons/common';
import { useAuthContext } from '../../contexts/AuthContext';
import { ProfileImageSize, ProfilePicture } from '../ProfilePicture';
import HeaderLogo from '../layout/HeaderLogo';
import { LogoPosition } from '../Logo';
import { webappUrl } from '../../lib/constants';
import { Button } from '../buttons/Button';
import { SettingsIcon } from '../icons';
import { RootPortal } from '../tooltips/Portal';

const ProfileSettingsMenuMobile = dynamic(
  () =>
    import(
      /* webpackChunkName: "profileSettingsMenuMobile" */ '../profile/ProfileSettingsMenu'
    ).then((mod) => mod.ProfileSettingsMenuMobile),
  { ssr: false },
);

export function MobileFeedActions(): ReactElement {
  const router = useRouter();
  const { user } = useAuthContext();
  const { streak, isLoading, isStreaksEnabled } = useReadingStreak();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex flex-row justify-between px-4 py-1">
      <HeaderLogo
        position={LogoPosition.Relative}
        onLogoClick={() => router.push('/')}
      />
      <span className="flex flex-row items-center gap-2">
        {isStreaksEnabled && (
          <ReadingStreakButton
            isLoading={isLoading}
            streak={streak}
            compact
            iconPosition={ButtonIconPosition.Right}
          />
        )}
        <Divider className="bg-border-subtlest-tertiary" vertical />
        {user && (
          <>
            <Button
              icon={<SettingsIcon />}
              variant={ButtonVariant.Tertiary}
              onClick={() => setIsMenuOpen(true)}
            />
            <RootPortal>
              <ProfileSettingsMenuMobile
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
              />
            </RootPortal>
            <Link href={`${webappUrl}${user.username}`} passHref>
              <a>
                <ProfilePicture
                  user={user}
                  size={ProfileImageSize.Medium}
                  nativeLazyLoading
                />
              </a>
            </Link>
          </>
        )}
      </span>
    </div>
  );
}
