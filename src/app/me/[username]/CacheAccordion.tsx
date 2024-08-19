'use client';

import { GalleryMasonry } from '@/components/GalleryMasonry';
import { Accordion, Button } from 'react-bootstrap';
import { Folder } from 'react-feather';
import styles from '../../main.module.scss';

export default function CacheAccordion(props: {
  cache: {
    name: string;
    id: string;
  };
  isCurrentUser: boolean;
  memes: any[];
}) {
  return (
    <div key={props.cache.id}>
      <Accordion>
        <Accordion.Item eventKey="0">
          <Accordion.Header className={'cache shadow-none'}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '16px',
                alignItems: 'center',
                flex: '1',
              }}
            >
              <h5
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '0',
                }}
              >
                <Folder size={20} style={{ marginBottom: '1px' }} />{' '}
                {props.cache.name}
              </h5>
              <p style={{ marginBottom: 0 }}>{props.memes.length} items</p>
            </div>
            <div>
              {props.isCurrentUser && (
                <span
                  className={`${styles['button']}`}
                  style={{ margin: '-8px 0px', marginLeft: 'auto' }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  Edit
                </span>
              )}
            </div>
          </Accordion.Header>
          <Accordion.Body className={'cache'}>
            {props.memes.length != 0 && (
              <div className={styles['memes-masonry']}>
                <GalleryMasonry memes={props.memes} />
              </div>
            )}
            {props.memes.length == 0 && <div>No memes found.</div>}
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
