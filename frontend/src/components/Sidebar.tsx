import React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';

export default function Sidebar({ section, setSection }) {
  const items = ['My Drive', 'Recent', 'Starred', 'Trash'];
  return (
    <List>
      {items.map(name => (
        <ListItem button key={name} selected={section===name}
          onClick={() => setSection(name)}>
          <ListItemText primary={name} />
        </ListItem>
      ))}
    </List>
  );
}
