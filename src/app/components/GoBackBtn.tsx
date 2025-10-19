import { useRouter } from 'next/router';

const GoBackBtn = () => {
  const router = useRouter(); 

  const handleGoBack = () => {
    router.back(); 
  };

  return (
    <button onClick={handleGoBack} className="btn-go-back">
      Go Back
    </button>
  );
};

export default GoBackBtn;
