import React, { useState } from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';

export default function FileCard({ file }) {
  const [open, setOpen] = useState(false);
  const previewUrl = file.downloadUrl;
  return (
    <>
      <Card sx={{ maxWidth: 200, m:1 }}>
        <CardActionArea onClick={()=>setOpen(true)}>
          <CardContent>
            <Typography variant="subtitle2" noWrap>{file.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.round(file.size/1024)} KB
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
      <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="lg">
        {file.content_type.startsWith('image/') ? (
          <img src={previewUrl} style={{maxWidth:'90vw',maxHeight:'90vh'}} />
        ) : file.content_type==='application/pdf' ? (
          <iframe src={previewUrl} width="90vw" height="90vh" />
        ) : (
          <a href={previewUrl} download>Download {file.name}</a>
        )}
      </Dialog>
    </>
  );
}
