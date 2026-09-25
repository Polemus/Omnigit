/**
 * What each update brought, newest first - opened from the Updates screen.
 *
 * The notes are `src/whats-new.ts`, which ships inside the JavaScript it describes, so the
 * top section is always the version running now. One section per update, in the same native
 * grouped rows as the screen it opens from, with the day it was published beneath.
 */

import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { FieldGroup } from '@/ui/field-group';
import { Host } from '@/ui/host';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { NavigationBarStrip } from '@/ui/screen';
import { Text } from '@/ui/text';
import { describeDay, WHATS_NEW } from '@/whats-new';

export default function WhatsNewScreen() {

  return (
    <>
      <Stack.Screen options={{ title: "What's new" }} />
      <Host style={styles.fill}>
        <FieldGroup>
          {WHATS_NEW.map((release, index) => (
            <FieldGroup.Section key={`${release.date}/${release.title}`} title={release.title}>
              {release.changes.map((change) => (
                <ListItem
                  key={change}
                  // The sparkle for what is new in this version; a tick for what came before.
                  leading={<Icon name={index === 0 ? Icons.sparkles : Icons.check} size={20} />}>
                  {change}
                </ListItem>
              ))}
              <FieldGroup.SectionFooter>
                <Text>
                  {index === 0
                    ? `${describeDay(release.date)} · the version you are running`
                    : describeDay(release.date)}
                </Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
          ))}
        </FieldGroup>
      </Host>
      <NavigationBarStrip />
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
