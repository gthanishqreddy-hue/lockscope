import { Link, useParams } from 'react-router';
import { Callout, Card, PageHeader, TheoryBadge } from '../components/ui';
import { TOPICS } from '../content/learn';

export function LearnPage() {
  const { topicId } = useParams();
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  if (!topic) return null;
  return (
    <>
      <PageHeader
        title="Learning Center"
        description="Short explanations of the ideas behind LockScope. Everything here is theory; measured results live in the Results Explorer."
      />
      <div className="grid grid-sidebar">
        <Card title="Topics">
          <nav aria-label="Topics">
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 4 }}>
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/learn/${t.id}`}
                    aria-current={t.id === topic.id ? 'page' : undefined}
                    style={{
                      fontWeight: t.id === topic.id ? 600 : 400,
                      textDecoration: t.id === topic.id ? 'underline' : 'none',
                    }}
                  >
                    {t.title}
                  </Link>
                  <div className="small muted">{t.summary}</div>
                </li>
              ))}
            </ul>
          </nav>
        </Card>
        <Card title={topic.title} actions={<TheoryBadge />}>
          <article className="stack" style={{ maxWidth: '75ch' }}>
            {topic.body}
          </article>
        </Card>
      </div>
      {topicId && !TOPICS.some((t) => t.id === topicId) && (
        <Callout tone="warning">Unknown topic; showing the first one.</Callout>
      )}
    </>
  );
}
