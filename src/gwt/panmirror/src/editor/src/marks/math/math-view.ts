/*
 * math-viewts
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Plugin, PluginKey, EditorState, Transaction } from "prosemirror-state";
import { Schema } from "prosemirror-model";
import { DecorationSet, EditorView, Decoration } from "prosemirror-view";

import { findChildrenByMark, setTextSelection } from "prosemirror-utils";
import { getMarkRange } from "../../api/mark";
import { AddMarkStep, RemoveMarkStep } from "prosemirror-transform";
import { EditorMath } from "../../api/math";


// TODO: reflow that result from math winding/unwinding cause the positioning 
// of the preview popup to be off (try clicking between display math blocks). 
// we added a layout updater and it didn't work -- perhaps we need a timer 
// based one as we do elsewhere.

// TODO: way to bump the priority of the active tab (use dom visibility?)
// TODO: why isn't debouncing of the typed math preview happening?
// TODO: cursor in math on "correct" side for arrow entry
// TODO: cursor placement for mouse click
// TODO: arrow up / arrow down (esp. w/ display math)


export function mathViewPlugin(schema: Schema, math: EditorMath) {


  const key = new PluginKey<DecorationSet>('math-view');

  function decorationsForDoc(state: EditorState) {

    const decorations: Decoration[] = [];
    findChildrenByMark(state.doc, schema.marks.math, true).forEach(markedNode => {
      // get mark range
      const range = getMarkRange(state.doc.resolve(markedNode.pos), schema.marks.math) as { from: number, to: number };

      // if the selection isn't in the mark, then show the preview
      if (state.selection.from < range.from || state.selection.from >= range.to) {
        // get the math text
        const mathText = state.doc.textBetween(range.from, range.to);

        // hide the code
        decorations.push(Decoration.inline(range.from, range.to, { style: "display: none;" }));

        // show a math preview
        decorations.push(Decoration.widget(
          range.from,
          (view: EditorView, getPos: () => number) => {
            const mathjaxDiv = window.document.createElement('div');
            mathjaxDiv.classList.add('pm-math-mathjax');
            // text selection 'within' code for clicks on the preview image
            mathjaxDiv.onclick = () => {
              const tr = view.state.tr;
              setTextSelection(getPos())(tr);
              view.dispatch(tr);
              view.focus();
            };
            math.typeset(mathjaxDiv, mathText);
            return mathjaxDiv;
          },
          { key: mathText },
        ));
      }
    });

    return DecorationSet.create(state.doc, decorations);
  }

  return new Plugin<DecorationSet>({
    key,

    state: {
      init(_config: { [key: string]: any }, instance: EditorState) {
        return decorationsForDoc(instance);
      },


      apply(tr: Transaction, set: DecorationSet, oldState: EditorState, newState: EditorState) {

        // if one of the steps added or removed a mark of our type then rescan the doc.
        if (
          tr.steps.some(
            step =>
              (step instanceof AddMarkStep && (step as any).mark.type === schema.marks.math) ||
              (step instanceof RemoveMarkStep && (step as any).mark.type === schema.marks.math),
          )
        ) {

          return decorationsForDoc(newState);

          // if the previous or current state has an active math mark, then rescan
        } else if (getMarkRange(oldState.selection.$from, schema.marks.math) ||
          getMarkRange(newState.selection.$from, schema.marks.math)) {

          return decorationsForDoc(newState);

          // incremental scanning based on presence of mark in changed regions
        } else {

          // adjust decoration positions to changes made by the transaction (decorations that apply
          // to removed chunks of content will be removed by this)
          return set.map(tr.mapping, tr.doc);

        }

      },
    },
    props: {
      decorations(state: EditorState) {
        return key.getState(state);
      },
    },
  });
}
