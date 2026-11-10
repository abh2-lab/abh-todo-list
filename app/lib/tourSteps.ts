// The steps of the help tour (the Help button in the top bar).
// Each step lights up one part of the app: the element with data-tour="<target>".
// When that part is not on the screen (or a step has no target), the box shows in the middle.

export interface TourStep {
  target?: string
  title: string
  text: string
}

/** The steps for this person. Guests do not see the task steps; they see how to log in. */
export function tourSteps({ loggedIn, phone }: { loggedIn: boolean; phone: boolean }): TourStep[] {
  const inMenu = phone ? 'Find it in the menu. ' : ''
  const steps: TourStep[] = [
    {
      title: 'Welcome to Notes',
      text: 'Here is a quick tour of what you can do. It takes about a minute. Use Next and Back, or Skip tour to close it.',
    },
    {
      target: 'menu',
      title: 'All your notes',
      text: loggedIn
        ? 'Open the list of notes here. "My notes" are private: only you can see them. Public notes, which everyone can read and edit, are folded at the bottom.'
          + (phone ? ' This menu also has Daily tasks, Pending and Help.' : '')
        : 'Open the list of notes here. These notes are public: anyone can read and edit them.',
    },
    {
      target: 'new-note',
      title: 'Make a new note',
      text: loggedIn
        ? 'Makes a new private note named with today\'s date, like "10 Nov 2026, Tuesday". If you already have a note with that name, the new one gets _2, _3 and so on.'
        : 'Makes a new public note.',
    },
    {
      target: 'title',
      title: 'Rename a note',
      text: 'Click the name of the note to change it. Press Enter to save.',
    },
    {
      target: 'toolbar',
      title: 'Write and style your note',
      text: 'Headings, bold, lists and checklists. You can also add images, YouTube videos, links and tables. Your note saves by itself while you type.',
    },
  ]

  if (loggedIn) {
    steps.push({
      target: 'today-task',
      title: 'Today\'s task',
      text: 'In your private notes, put the cursor on a line (or select a few lines) and click Today\'s task. The line goes to today\'s list in Daily tasks. Click it again to take the line off. Ticking a checklist line marks the task done.',
    })
  }

  steps.push(
    {
      target: 'view-mode',
      title: 'View mode',
      text: 'Read a note without changing it by mistake. Click again to go back to editing.',
    },
    {
      target: 'share',
      title: 'Share',
      text: loggedIn
        ? 'For a private note: turn on a view-only link, so others can read the note but not change it. For a public note: copies its link.'
        : 'Copies a link to this note, so others can open it.',
    },
  )

  if (loggedIn) {
    steps.push(
      {
        target: 'nav-tasks',
        title: 'Daily tasks',
        text: `${inMenu}A calendar of your tasks. A green dot is done, red is not done and the day is over, grey is not done yet. Move a task to the next day or pick a date, open its note, or select many tasks at once.`,
      },
      {
        target: 'nav-pending',
        title: 'Pending',
        text: `${inMenu}Tasks from past days that are not done. Mark them done, move them to today, or remove them. When something is left, this list also opens by itself once a day.`,
      },
    )
  } else {
    steps.push({
      target: 'login',
      title: 'Log in with Google',
      text: `${inMenu}Log in to get private notes that only you can see, and Daily tasks to plan your day.`,
    })
  }

  steps.push({
    target: 'help',
    title: 'That\'s it!',
    text: phone
      ? 'You can open this tour again any time: open the menu and tap Help.'
      : 'You can open this tour again any time with this Help button.',
  })

  return steps
}
