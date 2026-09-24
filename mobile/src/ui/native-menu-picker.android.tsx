/**
 * Android's full-width Material branch picker.
 *
 * The universal picker leaves its exposed text field at its intrinsic width. Inside the
 * branch row that made the field's filled background stop after the branch name. Both the
 * dropdown box and its anchor fill the width proposed by the React Native host here. The
 * field itself stays clear; the containing pill owns the single background while open.
 */

import {
  DropdownMenuItem,
  ExposedDropdownMenu,
  ExposedDropdownMenuBox,
  Text,
  TextField,
  type TextFieldRef,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxWidth,
  menuAnchor,
  onVisibilityChanged,
} from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Host } from './host';
import type { NativeMenuPickerProps } from './native-menu-picker';

export function NativeMenuPicker({
  options,
  selected,
  onValueChange,
  onExpandedChange,
}: NativeMenuPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const textFieldRef = useRef<TextFieldRef>(null);
  const selectedLabel = options.find((option) => option.value === selected)?.label ?? '';

  // The Compose text field is uncontrolled. Keep its displayed branch in step after the
  // native view has mounted, matching Expo's universal picker implementation.
  useEffect(() => {
    if (!isVisible) return;
    void textFieldRef.current?.setText(selectedLabel);
  }, [selectedLabel, isVisible]);

  const changeExpanded = (nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <ExposedDropdownMenuBox
        expanded={expanded}
        onExpandedChange={changeExpanded}
        modifiers={[fillMaxWidth()]}>
        <TextField
          ref={textFieldRef}
          readOnly
          singleLine
          colors={{
            focusedContainerColor: 'transparent',
            unfocusedContainerColor: 'transparent',
            disabledContainerColor: 'transparent',
            errorContainerColor: 'transparent',
            focusedIndicatorColor: 'transparent',
            unfocusedIndicatorColor: 'transparent',
            disabledIndicatorColor: 'transparent',
            errorIndicatorColor: 'transparent',
          }}
          modifiers={[
            fillMaxWidth(),
            menuAnchor(),
            onVisibilityChanged((visible) => setIsVisible(visible)),
          ]}
        />
        <ExposedDropdownMenu expanded={expanded} onDismissRequest={() => changeExpanded(false)}>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                onValueChange(option.value);
                changeExpanded(false);
              }}>
              <DropdownMenuItem.Text>
                <Text>{option.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </ExposedDropdownMenu>
      </ExposedDropdownMenuBox>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    minHeight: 28,
    justifyContent: 'center',
  },
});
