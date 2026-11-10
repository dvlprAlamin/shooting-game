import { styled } from '@mui/material';
import { MaterialDesignContent } from 'notistack';
export const StyledMaterialDesignContent = styled(MaterialDesignContent)(
  () => ({
    '&.notistack-MuiContent-success': {
      backgroundColor: 'transparent',
      color: '#1cff3e',
      boxShadow: 'none',
      paddingBlock: 0,
    },
    '&.notistack-MuiContent-error': {
      backgroundColor: 'transparent',
      color: '#ff0303',
      boxShadow: 'none',
      paddingBlock: 0,
    },
    '&.notistack-MuiContent-info': {
      backgroundColor: 'transparent',
      color: '#03ecff',
      boxShadow: 'none',
      paddingBlock: 0,
    },
    // '&.notistack-MuiContent-warning': {
    //   backgroundColor: 'transparent',
    //   color: '#ffb303',
    //   boxShadow: 'none',
    //   paddingBlock: 0,
    // },
    '&.notistack-MuiContent-default': {
      backgroundColor: 'transparent',
      color: '#fff',
      boxShadow: 'none',
      paddingBlock: 0,
    },
  })
);
