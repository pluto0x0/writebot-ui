import React from 'react';

const ThumbnailList = ({ thumbnails }) => {
  return (
    <div className="thumbnail-list">
      <h2 className="text-xl font-medium">已书写字符</h2>
      <div className="grid grid-cols-2 gap-4">
        {thumbnails.map((thumbnail, index) => (
          <div key={index} className="thumbnail-item">
            <img src={thumbnail.base64} alt={`Thumbnail ${index + 1}`} className="w-32 h-32 object-cover" />
            <p className="text-center">{thumbnail.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThumbnailList;