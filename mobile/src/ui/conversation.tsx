/**
 * The body of a pull request or an issue, and the comments under it.
 *
 * Shared between the two screens because a forge treats them as the same thing wearing
 * different names, and so should this - the only difference is which endpoint the
 * comments came from, and the manifest has already dealt with that.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { Comment } from '../hosts/types';
import { Radius, Spacing } from '../theme/tokens';
import { usePalette } from '../theme/use-palette';
import { Avatar } from './identity';
import { Markdown } from './markdown';
import { relativeTime } from './relative-time';

export function Conversation({
  author,
  authorAvatarUrl,
  body,
  createdAt,
  comments,
  grouped = false,
}: {
  author: string;
  authorAvatarUrl?: string;
  body?: string;
  createdAt?: string;
  comments: Comment[] | undefined;
  grouped?: boolean;
}) {
  const posts = [
    { author, avatarUrl: authorAvatarUrl, body, when: createdAt, isOriginal: true },
    ...(comments ?? []).map((comment) => ({
      author: comment.author,
      avatarUrl: comment.authorAvatarUrl,
      body: comment.body,
      when: comment.createdAt,
      isOriginal: false,
    })),
  ];

  return (
    <View style={[styles.thread, grouped && styles.groupedThread]}>
      {posts.map((post, index) => (
        <Post
          key={`${post.author}-${post.when}-${index}`}
          author={post.author}
          avatarUrl={post.avatarUrl}
          body={post.body}
          when={post.when}
          isOriginal={post.isOriginal}
          grouped={grouped}
          isLast={index === posts.length - 1}
        />
      ))}
    </View>
  );
}

function Post({
  author,
  avatarUrl,
  body,
  when,
  isOriginal = false,
  grouped = false,
  isLast = false,
}: {
  author: string;
  avatarUrl?: string;
  body?: string;
  when?: string;
  isOriginal?: boolean;
  grouped?: boolean;
  isLast?: boolean;
}) {
  const palette = usePalette();

  // An empty body is common - plenty of issues are a title and nothing else - and an
  // empty card reads as something failing to load, so it says so instead.
  const text = body?.trim();

  return (
    <View
      style={[
        styles.post,
        { backgroundColor: palette.surface, borderColor: palette.separator },
        isOriginal && { borderColor: palette.accentMuted, borderWidth: 1 },
        grouped && styles.groupedPost,
        grouped &&
          !isLast && {
            borderBottomColor: palette.separator,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
      ]}>
      <View style={styles.byline}>
        <Avatar url={avatarUrl} size={24} fallback={author} />
        <Text style={[styles.author, { color: palette.text }]} numberOfLines={1}>
          {author || 'Someone'}
        </Text>
        {when ? (
          <Text style={[styles.when, { color: palette.textTertiary }]}>{relativeTime(when)}</Text>
        ) : null}
      </View>

      {text ? (
        <Markdown source={text} />
      ) : (
        <Text style={[styles.empty, { color: palette.textTertiary }]}>No description.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: {
    gap: Spacing.three,
  },
  groupedThread: {
    gap: 0,
  },
  post: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  groupedPost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: Spacing.three,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  author: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  when: {
    fontSize: 12,
  },
  empty: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
