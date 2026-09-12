import { APP_STRINGS } from '@/lib/app/strings'
import { pluralize } from '@/lib/app/roster-loaders'
import type { Leaderboard, LeaderboardRow } from '@/lib/app/leaderboard-loaders'

// The Ljestvica panel (#457, glossary: *Ljestvica*).
//
// A server component: a ranked list of thirty nicknames is thirty rows of HTML,
// and nothing on it changes without a page load.
//
// What is deliberately NOT here: any treatment of the bottom of the list. No
// red, no "zadnji", no "fali ti još". A dancer with two evenings is on the same
// list as one with twenty because they are in the same society, and a board
// that shames the bottom is a board people stop opening.

/** The count on a row, and the width of the bar under the name. */
function BoardRow({ row }: { row: LeaderboardRow }) {
  return (
    <div className={`app__board-row${row.me ? ' app__board-row--me' : ''}`}>
      <span className="app__board-rank">{row.rank}</span>
      <span className="app__board-main">
        <span className="app__board-name">
          {row.nickname}
          {row.me && <em className="app__board-chip app__board-chip--me">{APP_STRINGS.board.you}</em>}
          {row.fullSeason && (
            <em className="app__board-chip">{APP_STRINGS.board.fullSeason}</em>
          )}
          {row.milestones.map((m) => (
            <em key={m} className="app__board-milestone">
              {m}
            </em>
          ))}
        </span>
        <span className="app__board-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(row.share * 100)}%` }} />
        </span>
      </span>
      <span className="app__board-count">{row.performances}</span>
    </div>
  )
}

export function Board({ board }: { board: Leaderboard }) {
  const empty = board.confirmedPerformances === 0
  // Rank 1 stands in the MIDDLE and tallest: a podium read left to right would
  // put second place first, which is the one thing a podium must not do.
  const podium = board.rows.slice(0, 3)

  return (
    <section className="app__board">
      {!empty && board.me && (
        <div className="app__board-me">
          <div className="app__board-mine">
            <b>#{board.me.rank}</b>
            <small>{APP_STRINGS.board.outOf(board.rows.length)}</small>
          </div>
          <div className="app__board-says">
            <p className="app__board-count-mine">
              {pluralize(board.me.performances, APP_STRINGS.home.count)}
            </p>
            <p>
              {board.me.rank === 1 || board.me.toNextPlace === null
                ? APP_STRINGS.board.leading
                : APP_STRINGS.board.toNextPlace(
                    pluralize(board.me.toNextPlace, APP_STRINGS.home.count),
                    board.me.rank - 1,
                  )}
            </p>
            {board.me.nextMilestone !== null && (
              <p className="app__board-milestone-line">
                {APP_STRINGS.board.nextMilestone(
                  APP_STRINGS.board.milestoneLabel(board.me.nextMilestone),
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {empty && <p className="app__empty-state">{APP_STRINGS.board.empty}</p>}

      {!empty && podium.length === 3 && (
        <div className="app__podium">
          {[podium[1], podium[0], podium[2]].map((row, i) => (
            <div
              key={row.memberId}
              className={`app__podium-tile${i === 1 ? ' app__podium-tile--first' : ''}`}
            >
              <b>{row.performances}</b>
              <span>{row.nickname}</span>
              <small>{row.rank}</small>
            </div>
          ))}
        </div>
      )}

      <div className="app__board-rows">
        {board.rows.map((row) => (
          <BoardRow key={row.memberId} row={row} />
        ))}
      </div>

      <p className="app__board-footer">
        {APP_STRINGS.board.footer(
          pluralize(board.confirmedPerformances, APP_STRINGS.board.confirmedCount),
        )}
      </p>
    </section>
  )
}
