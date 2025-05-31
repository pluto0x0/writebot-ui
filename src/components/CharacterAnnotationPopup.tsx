import React, { useState, ChangeEvent, CompositionEvent } from 'react'; // 确保导入 CompositionEvent 和 ChangeEvent

const CharacterAnnotationPopup = ({ /* ...props... */ }) => {
  const [char, setChar] = useState(''); // 假设这是存储字符的 state
  // 新增一个 state 来跟踪输入法组合状态
  const [isComposing, setIsComposing] = useState(false);

  const handleCharChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    if (!isComposing) {
      // 如果不是组合输入状态，则只取第一个字符
      setChar(value ? value.charAt(0) : '');
    } else {
      // 如果是组合输入状态，允许输入框显示中间过程
      setChar(value);
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    setIsComposing(false);
    // 组合结束后，确保只取第一个字符
    // event.data 通常是组合完成的字符，但 event.currentTarget.value 更可靠
    const { value } = event.currentTarget;
    setChar(value ? value.charAt(0) : '');
  };

  return (
    <div>
      {/* 其他组件内容 */}
      {/* 在你的 JSX 中，找到字符输入框，类似这样： */}
      <input
        type="text"
        value={char}
        onChange={handleCharChange}
        // 移除 maxLength={1}
        // maxLength={1} 
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="输入字符"
        // ...其他属性
      />
      {/* 如果你使用的是某个UI库的Input组件，例如 <Input ... />
      请确保它能正确传递 onCompositionStart, onCompositionEnd, onChange 事件
      并移除其 maxLength 或类似限制长度为1的属性。
      例如:
      <YourCustomInputComponent
        value={char}
        onChange={handleCharChange} // 或者UI库特定的onChange，可能需要适配event格式
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="输入字符"
        // 确保移除了任何等效于 maxLength={1} 的 props
      /> */}
    </div>
  );
}; // 结束组件
export default CharacterAnnotationPopup; // 导出组件