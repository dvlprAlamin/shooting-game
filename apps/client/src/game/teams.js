// Names and colours of the two teams in a team match. The ids are TEAMS from @shooter/shared; the colours
// are --team-a / --team-b in index.scss, repeated here for the 3D name tags. Blue and gold stay apart for
// colour-blind players and from the kit's other colours (blaze is you, teal is spawn protection).
export const TEAM_INFO = {
  a: { name: 'Blue', color: '#62a8ff' },
  b: { name: 'Gold', color: '#f0c23b' },
};

export const teamName = (team) => TEAM_INFO[team]?.name ?? '';
export const otherTeam = (team) => (team === 'a' ? 'b' : 'a');
/** CSS colour of a team, for inline styles. */
export const teamColor = (team) => (team ? `var(--team-${team})` : undefined);
