import type { ReactElement } from 'react';
import React, { useContext, useMemo } from 'react';
import { FeedSettingsEditContext } from '../FeedSettingsEditContext';
import useFeedSettings from '../../../../hooks/useFeedSettings';
import { useAdvancedSettings } from '../../../../hooks/feed/useAdvancedSettings';
import {
  getArticleSettings,
  getContentCurationList,
  getContentSourceList,
  getVideoSetting,
} from '../../../filters/helpers';
import {
  Typography,
  TypographyColor,
  TypographyType,
} from '../../../typography/Typography';
import { FilterCheckbox } from '../../../fields/FilterCheckbox';
import { FeedType } from '../../../../graphql/feed';

const ADVANCED_SETTINGS_KEY = 'advancedSettings';

export const FeedSettingsContentPreferencesSection = (): ReactElement => {
  const { feed, editFeedSettings } = useContext(FeedSettingsEditContext);
  const { advancedSettings } = useFeedSettings({ feedId: feed?.id });
  const videoSetting = getVideoSetting(advancedSettings);
  const articleSetting = getArticleSettings(advancedSettings);
  const {
    selectedSettings,
    onToggleSettings,
    checkSourceBlocked,
    onToggleSource,
    onUpdateSettings,
  } = useAdvancedSettings({ feedId: feed?.id });

  const contentSourceList = useMemo(
    () => getContentSourceList(advancedSettings),
    [advancedSettings],
  );

  const contentCurationList = useMemo(
    () => getContentCurationList(advancedSettings),
    [advancedSettings],
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Typography bold type={TypographyType.Body}>
            Content types
          </Typography>
          <Typography
            type={TypographyType.Callout}
            color={TypographyColor.Tertiary}
          >
            Select the types of content you want to include in your feed.
          </Typography>
        </div>
        <div className="flex flex-col">
          {videoSetting && (
            <FilterCheckbox
              name={videoSetting.title}
              checked={
                selectedSettings[videoSetting.id] ??
                videoSetting.defaultEnabledState
              }
              onToggleCallback={() =>
                editFeedSettings(() =>
                  onToggleSettings(
                    videoSetting.id,
                    videoSetting.defaultEnabledState,
                  ),
                )
              }
            >
              {videoSetting.title}
            </FilterCheckbox>
          )}
          {articleSetting.length && feed?.type === FeedType.Custom ? (
            <FilterCheckbox
              name="Articles"
              checked={
                articleSetting.filter(({ id }) => selectedSettings[id] ?? true)
                  .length > 0
              }
              onToggleCallback={(enabled) => {
                editFeedSettings(() =>
                  onUpdateSettings(
                    articleSetting.map(({ id }) => ({ id, enabled })),
                  ),
                );
              }}
            >
              Articles
            </FilterCheckbox>
          ) : (
            <FilterCheckbox name="Articles" disabled checked>
              Articles
            </FilterCheckbox>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Typography bold type={TypographyType.Body}>
            Categories
          </Typography>
          <Typography
            type={TypographyType.Callout}
            color={TypographyColor.Tertiary}
          >
            Pick the categories of content you&apos;d like to see in your feed.
          </Typography>
        </div>
        {contentSourceList?.map(({ id, title, description, options }) => (
          <FilterCheckbox
            key={id}
            name={`${ADVANCED_SETTINGS_KEY}-${id}`}
            checked={!checkSourceBlocked(options.source)}
            description={description}
            onToggleCallback={() =>
              editFeedSettings(() => onToggleSource(options.source))
            }
            descriptionClassName="text-text-tertiary"
          >
            <Typography bold>{title}</Typography>
          </FilterCheckbox>
        ))}
        {contentCurationList?.map(
          ({ id, title, description, defaultEnabledState }) => (
            <FilterCheckbox
              key={id}
              name={`${ADVANCED_SETTINGS_KEY}-${id}`}
              checked={selectedSettings[id] ?? defaultEnabledState}
              description={description}
              onToggleCallback={() =>
                editFeedSettings(() =>
                  onToggleSettings(id, defaultEnabledState),
                )
              }
              descriptionClassName="text-text-tertiary"
            >
              <Typography bold>{title}</Typography>
            </FilterCheckbox>
          ),
        )}
      </div>
    </>
  );
};
